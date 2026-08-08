import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Invite un avocat par email : crée la ligne "lawyers" (si absente) et envoie
// un email d'invitation. Le trigger handle_new_user liera automatiquement le
// compte à sa fiche lors du premier signup, et attribuera le rôle "avocat".
export const inviteLawyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    email: z.string().trim().email("Email invalide"),
    first_name: z.string().trim().min(1),
    last_name: z.string().trim().min(1),
    license: z.string().trim().min(1),
    firm_id: z.string().uuid().nullable().optional(),
    specialty: z.string().trim().nullable().optional(),
    city: z.string().trim().nullable().optional(),
    redirect_to: z.string().url(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isBat } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "batonnier" });
    if (!isBat) throw new Error("Seul la direction peut inviter un avocat.");

    // 1) Upsert de la fiche lawyer avec l'email
    const { data: existing } = await context.supabase
      .from("lawyers").select("id, email").eq("license", data.license).maybeSingle();

    if (existing) {
      await context.supabase.from("lawyers").update({
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        firm_id: data.firm_id ?? null,
        specialty: data.specialty ?? null,
        city: data.city ?? null,
      }).eq("id", existing.id);
    } else {
      const { error: insErr } = await context.supabase.from("lawyers").insert({
        license: data.license,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        firm_id: data.firm_id ?? null,
        specialty: data.specialty ?? null,
        city: data.city ?? null,
        admitted_on: new Date().toISOString().slice(0, 10),
        status: "active",
      });
      if (insErr) throw new Error(insErr.message);
    }

    // 2) Envoi de l'invitation via l'API admin (service role)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirect_to,
      data: { full_name: `${data.first_name} ${data.last_name}` },
    });
    if (invErr) {
      // Si l'utilisateur existe déjà, on ne bloque pas — la fiche est mise à jour et
      // le lien se fera au prochain login. On renvoie juste une info.
      const msg = invErr.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return { ok: true, alreadyRegistered: true };
      }
      throw new Error(invErr.message);
    }
    return { ok: true, alreadyRegistered: false };
  });
