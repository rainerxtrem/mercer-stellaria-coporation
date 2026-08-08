import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Email invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères").max(128),
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  license: z.string().trim().min(3).max(30),
  admitted_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  role: z.enum(["avocat", "batonnier"]).default("avocat"),
  firm_id: z.string().uuid().nullable().optional(),
  specialty: z.string().max(80).nullable().optional(),
  city: z.string().max(60).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
  photo_url: z.string().url().max(500).nullable().optional(),
  status: z.enum(["active", "suspended", "revoked"]).default("active"),
});

export const createLawyerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    // Authorization: only CEO
    const { data: isBat, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "batonnier",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isBat) throw new Error("Seul la direction peut créer directement un compte avocat.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Guard: license already taken?
    const { data: existingLic } = await supabaseAdmin
      .from("lawyers")
      .select("id")
      .eq("license", data.license)
      .maybeSingle();
    if (existingLic) {
      throw new Error(`Le numéro de licence « ${data.license} » est déjà utilisé.`);
    }

    // 2) Create auth user
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: `${data.first_name} ${data.last_name}` },
    });
    if (createErr || !created?.user) {
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists") || msg.includes("duplicate")) {
        throw new Error(`Un compte existe déjà avec l'email ${data.email}.`);
      }
      if (msg.includes("password")) {
        throw new Error(`Mot de passe refusé : ${createErr?.message}`);
      }
      throw new Error(createErr?.message ?? "Impossible de créer le compte d'authentification.");
    }
    const newUserId = created.user.id;

    // Helper: rollback auth user on any subsequent failure
    const rollback = async (reason: string): Promise<never> => {
      try { await supabaseAdmin.auth.admin.deleteUser(newUserId); } catch { /* best effort */ }
      throw new Error(reason);
    };

    // 3) Ensure profile row exists (trigger normally creates it, but be defensive)
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: newUserId, full_name: `${data.first_name} ${data.last_name}` }, { onConflict: "id" });
    if (profileErr) await rollback(`Profil : ${profileErr.message}`);

    // 4) Create lawyer record linked to the new user
    const { data: lawyer, error: lawyerErr } = await supabaseAdmin
      .from("lawyers")
      .insert({
        license: data.license,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        firm_id: data.firm_id ?? null,
        specialty: data.specialty ?? null,
        city: data.city ?? null,
        phone: data.phone ?? null,
        address: data.address ?? null,
        bio: data.bio ?? null,
        photo_url: data.photo_url ?? null,
        admitted_on: data.admitted_on,
        status: data.status,
        profile_id: newUserId,
      })
      .select("id")
      .single();
    if (lawyerErr || !lawyer) {
      await rollback(`Fiche avocat : ${lawyerErr?.message ?? "création impossible"}`);
    }

    // 5) Assign role (in addition to default 'citoyen' from handle_new_user trigger)
    const { error: roleInsErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newUserId, role: data.role });
    if (roleInsErr && !roleInsErr.message.toLowerCase().includes("duplicate")) {
      // Cleanup lawyer row before rollback
      await supabaseAdmin.from("lawyers").delete().eq("id", lawyer!.id);
      await rollback(`Attribution du rôle : ${roleInsErr.message}`);
    }

    // 6) Audit log (best effort)
    try {
      await supabaseAdmin.from("audit_log").insert({
        actor_id: context.userId,
        entity_type: "lawyer",
        entity_id: lawyer!.id,
        action: "create_account",
        summary: `Compte avocat créé pour ${data.first_name} ${data.last_name} (${data.email})`,
      });
    } catch { /* non-blocking */ }

    return { ok: true, user_id: newUserId, lawyer_id: lawyer!.id };
  });
