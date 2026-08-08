import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(255),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères").max(128).optional(),
  first_name: z.string().trim().min(1, "Le prénom est requis").max(80),
  last_name: z.string().trim().min(1, "Le nom est requis").max(80),
  company: z.string().trim().max(150).nullable().optional(),
  job_title: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  matter_ids: z.array(z.string().uuid()).max(50).optional(),
});

/** Autorise CEO et Directeur de cabinet ; renvoie le cabinet de rattachement. */
async function requireFirmManager(context: { supabase: any; userId: string }) {
  const [{ data: isBat }, { data: isManager }] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "batonnier" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "responsable_cabinet" }),
  ]);
  if (!isBat && !isManager) {
    throw new Error("Seul un directeur de cabinet ou la direction peut créer un compte client.");
  }
  const { data: firmId } = await context.supabase.rpc("get_my_firm_id");
  return { firmId: (firmId as string | null) ?? null, isBat: Boolean(isBat) };
}

export const createClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { firmId } = await requireFirmManager(context);
    const generatedPassword = crypto.randomUUID().replace(/-/g, "") + "A!9";
    const password = data.password ?? generatedPassword;

    // Les dossiers à rattacher doivent être accessibles à l'appelant (RLS).
    let matterIds: string[] = [];
    if (data.matter_ids?.length) {
      const { data: rows } = await context.supabase
        .from("matters")
        .select("id")
        .in("id", data.matter_ids);
      matterIds = (rows ?? []).map((r: any) => r.id);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const full_name = `${data.first_name} ${data.last_name}`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr || !created?.user) {
      const msg = (createErr?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        throw new Error(`Un compte existe déjà avec l'adresse ${data.email}.`);
      }
      throw new Error(createErr?.message ?? "Création du compte impossible.");
    }
    const userId = created.user.id;

    const rollback = async (reason: string): Promise<never> => {
      try { await supabaseAdmin.auth.admin.deleteUser(userId); } catch { /* best effort */ }
      throw new Error(reason);
    };

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, full_name }, { onConflict: "id" });
    if (profErr) await rollback(`Profil : ${profErr.message}`);

    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "client" });
    if (roleErr && !roleErr.message.toLowerCase().includes("duplicate")) {
      await rollback(`Attribution du rôle : ${roleErr.message}`);
    }
    // Le trigger d'inscription ajoute 'citoyen' : on le retire pour un compte client pur.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("role", "citoyen");

    const { data: client, error: clientErr } = await supabaseAdmin
      .from("clients")
      .insert({
        owner_id: context.userId,
        firm_id: firmId,
        profile_id: userId,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: data.phone ?? null,
        address: data.address ?? null,
        company: data.company ?? null,
        job_title: data.job_title ?? null,
      })
      .select("id")
      .single();
    if (clientErr || !client) await rollback(`Fiche client : ${clientErr?.message ?? "création impossible"}`);

    if (matterIds.length > 0) {
      await supabaseAdmin.from("matter_clients").insert(
        matterIds.map((matter_id) => ({ matter_id, client_id: client!.id, created_by: context.userId })),
      );
      await supabaseAdmin.from("matter_activity").insert(
        matterIds.map((matter_id) => ({
          matter_id,
          actor_id: context.userId,
          action: "client_linked",
          summary: `Client ${data.first_name} ${data.last_name} rattaché au dossier`,
          entity_type: "client",
          entity_id: client!.id,
          metadata: {},
        })),
      );
    }

    await supabaseAdmin.from("audit_log").insert({
      actor_id: context.userId,
      entity_type: "client",
      entity_id: client!.id,
      action: "create_client_account",
      summary: `Compte client créé pour ${full_name} (${data.email})`,
    });

    return { ok: true, client_id: client!.id, user_id: userId };
  });

export const linkClientDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string; discord_user_id: string; discord_username?: string | null }) => ({
    client_id: z.string().uuid().parse(d.client_id),
    discord_user_id: z.string().regex(/^[0-9]{15,25}$/).parse(d.discord_user_id),
    discord_username: z.string().trim().max(120).nullable().optional().parse(d.discord_username ?? null),
  }))
  .handler(async ({ data, context }) => {
    await requireFirmManager(context);
    const { error } = await context.supabase
      .from("clients")
      .update({
        discord_user_id: data.discord_user_id,
        discord_username: data.discord_username,
      })
      .eq("id", data.client_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unlinkClientDiscord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string }) => ({ client_id: z.string().uuid().parse(d.client_id) }))
  .handler(async ({ data, context }) => {
    await requireFirmManager(context);
    const { error } = await context.supabase
      .from("clients")
      .update({
        discord_user_id: null,
        discord_username: null,
        discord_channel_id: null,
      })
      .eq("id", data.client_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setClientDiscordChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string; discord_channel_id?: string | null; discord_webhook_url?: string | null }) => ({
    client_id: z.string().uuid().parse(d.client_id),
    discord_channel_id: z.string().regex(/^[0-9]{15,25}$/).nullable().optional().parse(d.discord_channel_id ?? null),
    discord_webhook_url: z.string().trim().url().max(400).nullable().optional().parse(d.discord_webhook_url ?? null),
  }))
  .handler(async ({ data, context }) => {
    await requireFirmManager(context);
    if (data.discord_webhook_url) {
      const { isValidDiscordWebhook } = await import("@/lib/notify.server");
      if (!isValidDiscordWebhook(data.discord_webhook_url)) {
        throw new Error("URL webhook Discord invalide.");
      }
    }
    const { error } = await context.supabase
      .from("clients")
      .update({
        discord_channel_id: data.discord_channel_id,
        discord_webhook_url: data.discord_webhook_url,
      })
      .eq("id", data.client_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Rattache / détache un client aux dossiers du cabinet. */
export const setClientMatters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string; matter_ids: string[] }) => ({
    client_id: z.string().uuid().parse(d.client_id),
    matter_ids: z.array(z.string().uuid()).max(100).parse(d.matter_ids ?? []),
  }))
  .handler(async ({ data, context }) => {
    const { data: accessible } = await context.supabase
      .from("matters")
      .select("id")
      .in("id", data.matter_ids.length ? data.matter_ids : ["00000000-0000-0000-0000-000000000000"]);
    const allowed = new Set((accessible ?? []).map((r: any) => r.id));

    const { data: current } = await context.supabase
      .from("matter_clients")
      .select("matter_id")
      .eq("client_id", data.client_id);
    const currentIds = new Set((current ?? []).map((r: any) => r.matter_id));

    const toAdd = [...allowed].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !allowed.has(id as string));

    if (toAdd.length > 0) {
      const { error } = await context.supabase.from("matter_clients").insert(
        toAdd.map((matter_id) => ({ matter_id, client_id: data.client_id, created_by: context.userId })),
      );
      if (error) throw new Error(error.message);
    }
    for (const matter_id of toRemove) {
      await context.supabase
        .from("matter_clients")
        .delete()
        .eq("client_id", data.client_id)
        .eq("matter_id", matter_id);
    }
    return { ok: true, linked: allowed.size };
  });

export const listClientMatters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { client_id: string }) => ({ client_id: z.string().uuid().parse(d.client_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("matter_clients")
      .select("matter_id, matters(id, number, title, status)")
      .eq("client_id", data.client_id);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => r.matters).filter(Boolean);
  });

/** Partage (ou retire du partage) un document avec le client du dossier. */
export const setDocumentSharing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { document_id: string; shared: boolean }) => ({
    document_id: z.string().uuid().parse(d.document_id),
    shared: z.boolean().parse(d.shared),
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("matter_documents")
      .update({
        shared_with_client: data.shared,
        shared_at: data.shared ? new Date().toISOString() : null,
        shared_by: data.shared ? context.userId : null,
      })
      .eq("id", data.document_id)
      .select("matter_id, filename")
      .single();
    if (error) throw new Error(error.message);

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase,
      context.userId,
      row.matter_id,
      data.shared ? "doc_shared" : "doc_unshared",
      data.shared
        ? `Document « ${row.filename} » partagé avec le client`
        : `Partage du document « ${row.filename} » retiré`,
      { entity_type: "document", entity_id: data.document_id },
    );

    if (data.shared) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { notifyClient } = await import("@/lib/notify.server");
      const { data: links } = await supabaseAdmin
        .from("matter_clients")
        .select("clients(profile_id, discord_webhook_url)")
        .eq("matter_id", row.matter_id);
      for (const l of links ?? []) {
        await notifyClient(supabaseAdmin, (l as any).clients, {
          type: "document_shared",
          title: "Nouveau document disponible",
          body: `« ${row.filename} » a été partagé avec vous.`,
          link: "/portail-client/documents",
          entity_type: "document",
          entity_id: data.document_id,
        });
      }
    }
    return { ok: true };
  });
