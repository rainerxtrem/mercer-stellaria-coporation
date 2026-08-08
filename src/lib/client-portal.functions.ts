import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withActorNames } from "@/lib/activity-log";
import { z } from "zod";

const CLIENT_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "text/plain",
]);
const MAX_SIZE = 50 * 1024 * 1024;

async function myClientRow(context: { supabase: any; userId: string }) {
  const { data: isClient } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "client",
  });
  if (!isClient) throw new Error("Acces reserve au portail client.");

  const { data, error } = await context.supabase
    .from("clients")
    .select("id, first_name, last_name, email, phone, address, company, job_title, discord_webhook_url, firm_id")
    .eq("profile_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Aucun dossier client n'est associé à votre compte.");
  return data;
}

async function getOrCreateGeneralConversation(
  context: { supabase: any; userId: string },
  client: { id: string; firm_id: string | null },
  firmId: string,
) {
  const { data: existing } = await context.supabase
    .from("client_conversations")
    .select("id, client_id, firm_id, matter_id, subject, status, client_last_read_at, staff_last_read_at, created_at, updated_at")
    .eq("client_id", client.id)
    .eq("firm_id", firmId)
    .is("matter_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await context.supabase
    .from("client_conversations")
    .insert({
      client_id: client.id,
      firm_id: firmId,
      created_by: context.userId,
      subject: "Contacter l'entreprise",
    })
    .select("id, client_id, firm_id, matter_id, subject, status, client_last_read_at, staff_last_read_at, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return created;
}

async function getClientConversation(
  context: { supabase: any; userId: string },
  clientId: string,
  conversationId: string,
) {
  const { data, error } = await context.supabase
    .from("client_conversations")
    .select("id, client_id, firm_id, matter_id, subject, status, client_last_read_at, staff_last_read_at, created_at, updated_at")
    .eq("id", conversationId)
    .eq("client_id", clientId)
    .is("matter_id", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conversation inaccessible.");
  return data;
}

async function listClientMessagingFirms(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: memberships }, { data: modules }] = await Promise.all([
    supabaseAdmin
      .from("enterprise_memberships")
      .select("firm_id, firms(id, name, logo_url)")
      .eq("user_id", userId)
      .eq("status", "active"),
    supabaseAdmin
      .from("enterprise_modules")
      .select("firm_id")
      .eq("module_slug", "messaging")
      .eq("enabled", true),
  ]);
  const enabledFirmIds = new Set((modules ?? []).map((row: any) => row.firm_id));
  return (memberships ?? [])
    .map((row: any) => ({
      id: row.firm_id as string,
      name: String(row.firms?.name ?? "Entreprise"),
      logo_url: (row.firms?.logo_url as string | null) ?? null,
    }))
    .filter((firm) => enabledFirmIds.has(firm.id));
}

// ============ PROFIL ============
export const getClientProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await myClientRow(context);
    let firm: { name: string } | null = null;
    if (client.firm_id) {
      const { data } = await context.supabase.from("firms").select("name").eq("id", client.firm_id).maybeSingle();
      firm = data ?? null;
    }
    return { ...client, firm_name: firm?.name ?? null };
  });

export const updateClientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    phone?: string | null; address?: string | null; company?: string | null;
    job_title?: string | null; discord_webhook_url?: string | null;
  }) => ({
    phone: z.string().trim().max(30).nullable().optional().parse(d.phone || null),
    address: z.string().trim().max(300).nullable().optional().parse(d.address || null),
    company: z.string().trim().max(150).nullable().optional().parse(d.company || null),
    job_title: z.string().trim().max(120).nullable().optional().parse(d.job_title || null),
    discord_webhook_url: z.string().trim().url("URL de webhook invalide").max(400).nullable().optional()
      .parse(d.discord_webhook_url || null),
  }))
  .handler(async ({ data, context }) => {
    if (data.discord_webhook_url) {
      const { isValidDiscordWebhook } = await import("@/lib/notify.server");
      if (!isValidDiscordWebhook(data.discord_webhook_url)) {
        throw new Error("Ce lien n'est pas un webhook Discord valide.");
      }
    }
    const client = await myClientRow(context);
    const { error } = await context.supabase.from("clients").update(data).eq("id", client.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testClientDiscordWebhook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await myClientRow(context);
    const { sendDiscordWebhook } = await import("@/lib/notify.server");
    const ok = await sendDiscordWebhook(client.discord_webhook_url, {
      title: "Mercer & Stellaria Corporation",
      body: "Notification de test : votre webhook est correctement configuré.",
    });
    if (!ok) throw new Error("Envoi impossible : vérifiez l'URL du webhook.");
    return { ok: true };
  });

// ============ DOSSIERS ============
export const listClientMattersPortal = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("matters")
      .select("id, number, title, status, type, opened_on, owner_id")
      .order("opened_on", { ascending: false });
    if (error) throw new Error(error.message);
    return withActorNames(context.supabase, data ?? [], { owner_id: "owner_name" });
  });

export const getClientMatter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string }) => ({ matter_id: z.string().uuid().parse(d.matter_id) }))
  .handler(async ({ data, context }) => {
    const [{ data: matter }, { data: docs }, { data: activity }] = await Promise.all([
      context.supabase
        .from("matters")
        .select("id, number, title, status, type, description, opened_on, owner_id")
        .eq("id", data.matter_id)
        .maybeSingle(),
      context.supabase
        .from("matter_documents")
        .select("id, filename, mime_type, size_bytes, created_at, uploaded_by_client")
        .eq("matter_id", data.matter_id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("matter_activity")
        .select("id, action, summary, created_at")
        .eq("matter_id", data.matter_id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (!matter) throw new Error("Dossier introuvable");
    const [named] = await withActorNames(context.supabase, [matter], { owner_id: "owner_name" });
    return { matter: named, documents: docs ?? [], activity: activity ?? [] };
  });

// ============ DOCUMENTS ============
export const listClientDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("matter_documents")
      .select("id, filename, mime_type, size_bytes, created_at, uploaded_by_client, matter_id, matters(id, number, title)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getClientDocumentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("matter_documents")
      .select("storage_path, filename, matter_id, mime_type")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Document introuvable ou non partagé.");
    const { data: signed, error: sErr } = await context.supabase.storage
      .from("bar-media")
      .createSignedUrl(row.storage_path, 300);
    if (sErr) throw new Error(sErr.message);

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase, context.userId, row.matter_id,
      "client_doc_download",
      `Le client a consulté « ${row.filename} »`,
      { entity_type: "document", entity_id: data.id },
    );
    return { url: signed.signedUrl, filename: row.filename, mime_type: row.mime_type };
  });

export const createClientUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string; filename: string; mime_type: string; size_bytes: number }) => ({
    matter_id: z.string().uuid().parse(d.matter_id),
    filename: z.string().trim().min(1).max(255).parse(d.filename),
    mime_type: z.string().max(120).parse(d.mime_type),
    size_bytes: z.number().int().nonnegative().parse(d.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    if (data.size_bytes > MAX_SIZE) throw new Error("Fichier trop volumineux (50 Mo maximum).");
    if (!CLIENT_ALLOWED_MIME.has(data.mime_type)) throw new Error("Type de fichier non autorisé.");
    const docId = crypto.randomUUID();
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `matters/${data.matter_id}/${docId}-${safeName}`;
    const { data: signed, error } = await context.supabase.storage
      .from("bar-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { doc_id: docId, path, signed_url: signed.signedUrl, token: signed.token };
  });

export const finalizeClientUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    doc_id: string; matter_id: string; filename: string; storage_path: string;
    mime_type: string; size_bytes: number; comment?: string | null;
  }) => ({
    doc_id: z.string().uuid().parse(d.doc_id),
    matter_id: z.string().uuid().parse(d.matter_id),
    filename: z.string().trim().min(1).max(255).parse(d.filename),
    storage_path: z.string().max(500).parse(d.storage_path),
    mime_type: z.string().max(120).parse(d.mime_type),
    size_bytes: z.number().int().nonnegative().parse(d.size_bytes),
    comment: z.string().trim().max(1000).nullable().optional().parse(d.comment || null),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("matter_documents").insert({
      id: data.doc_id,
      matter_id: data.matter_id,
      filename: data.filename,
      storage_path: data.storage_path,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      uploaded_by: context.userId,
      uploaded_by_client: true,
      shared_with_client: true,
      comment: data.comment,
      tags: ["client"],
    });
    if (error) throw new Error(error.message);

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase, context.userId, data.matter_id,
      "client_doc_upload",
      `Le client a déposé « ${data.filename} »`,
      { entity_type: "document", entity_id: data.doc_id },
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyUser } = await import("@/lib/notify.server");
    const { data: matter } = await supabaseAdmin
      .from("matters").select("owner_id, number").eq("id", data.matter_id).maybeSingle();
    await notifyUser(supabaseAdmin, matter?.owner_id, {
      type: "client_upload",
      title: "Pièce déposée par un client",
      body: `${matter?.number ?? ""} — ${data.filename}`.trim(),
      link: `/dossiers/${data.matter_id}`,
      entity_type: "document",
      entity_id: data.doc_id,
    });
    return { ok: true };
  });

// ============ CONVERSATIONS ============
export const listClientMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string }) => ({ matter_id: z.string().uuid().parse(d.matter_id) }))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("matter_messages")
      .update({ read_by_client_at: new Date().toISOString() })
      .eq("matter_id", data.matter_id)
      .neq("author_id", context.userId)
      .is("read_by_client_at", null);

    const { data: rows, error } = await context.supabase
      .from("matter_messages")
      .select("id, body, author_id, created_at, document_id, matter_documents(id, filename, mime_type)")
      .eq("matter_id", data.matter_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const withNames = await withActorNames(context.supabase, rows ?? [], { author_id: "author_name" });
    return withNames.map((m: any) => ({ ...m, mine: m.author_id === context.userId }));
  });

export const listClientNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await myClientRow(context);
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markClientNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ids?: string[] | null }) => ({
    ids: z.array(z.string().uuid()).nullable().optional().parse(d.ids ?? null),
  }))
  .handler(async ({ data, context }) => {
    await myClientRow(context);
    const q = context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    const scoped = data.ids && data.ids.length > 0 ? q.in("id", data.ids) : q;
    const { error } = await scoped;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getClientGeneralConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await myClientRow(context);
    const firms = await listClientMessagingFirms(context.userId);
    const firmId = firms[0]?.id ?? client.firm_id;
    if (!firmId) throw new Error("Aucune entreprise autorisée.");
    return getOrCreateGeneralConversation(context, client, firmId);
  });

export const listClientConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await myClientRow(context);
    const firms = await listClientMessagingFirms(context.userId);
    const conversations = await Promise.all(
      firms.map(async (firm) => ({
        ...(await getOrCreateGeneralConversation(context, client, firm.id)),
        firm_name: firm.name,
        firm_logo_url: firm.logo_url,
      })),
    );

    const ids = conversations.map((conversation) => conversation.id);
    const latestByConversation = new Map<string, any>();
    if (ids.length > 0) {
      const { data: messages, error } = await context.supabase
        .from("client_conversation_messages")
        .select("id, conversation_id, author_id, body, attachment_name, created_at")
        .in("conversation_id", ids)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      for (const message of messages ?? []) {
        if (!latestByConversation.has((message as any).conversation_id)) {
          latestByConversation.set((message as any).conversation_id, message);
        }
      }
    }

    return {
      client: {
        first_name: client.first_name,
        last_name: client.last_name,
      },
      conversations: conversations.map((conversation) => ({
        ...conversation,
        latest_message: latestByConversation.has(conversation.id)
          ? {
              ...latestByConversation.get(conversation.id),
              mine: latestByConversation.get(conversation.id).author_id === context.userId,
            }
          : null,
      })),
    };
  });

export const listClientGeneralMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversation_id: string }) => ({
    conversation_id: z.string().uuid().parse(data.conversation_id),
  }))
  .handler(async ({ data, context }) => {
    const client = await myClientRow(context);
    const conversation = await getClientConversation(context, client.id, data.conversation_id);
    const { data: rows, error } = await context.supabase
      .from("client_conversation_messages")
      .select("id, conversation_id, author_id, body, attachment_path, attachment_name, attachment_mime, attachment_size_bytes, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const withNames = await withActorNames(context.supabase, rows ?? [], { author_id: "author_name" });
    return {
      conversation,
      messages: withNames.map((row: any) => ({ ...row, mine: row.author_id === context.userId })),
    };
  });

export const sendClientGeneralMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    conversation_id: string;
    body: string;
    attachment_path?: string | null;
    attachment_name?: string | null;
    attachment_mime?: string | null;
    attachment_size_bytes?: number | null;
  }) => ({
    conversation_id: z.string().uuid().parse(d.conversation_id),
    body: z.string().trim().max(5000).parse(d.body),
    attachment_path: z.string().trim().max(600).nullable().optional().parse(d.attachment_path ?? null),
    attachment_name: z.string().trim().max(255).nullable().optional().parse(d.attachment_name ?? null),
    attachment_mime: z.string().trim().max(120).nullable().optional().parse(d.attachment_mime ?? null),
    attachment_size_bytes: z.number().int().nonnegative().nullable().optional().parse(d.attachment_size_bytes ?? null),
  }))
  .handler(async ({ data, context }) => {
    const client = await myClientRow(context);
    if (!data.body && !data.attachment_path) throw new Error("Le message est vide");
    const conversation = await getClientConversation(context, client.id, data.conversation_id);
    const { data: created, error } = await context.supabase
      .from("client_conversation_messages")
      .insert({
        conversation_id: conversation.id,
        author_id: context.userId,
        body: data.body,
        attachment_path: data.attachment_path,
        attachment_name: data.attachment_name,
        attachment_mime: data.attachment_mime,
        attachment_size_bytes: data.attachment_size_bytes,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase
      .from("client_conversations")
      .update({ staff_last_read_at: null })
      .eq("id", conversation.id);

    if (conversation.firm_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: managers } = await supabaseAdmin
        .from("lawyers")
        .select("profile_id")
        .eq("firm_id", conversation.firm_id)
        .not("profile_id", "is", null);
      const { notifyUser } = await import("@/lib/notify.server");
      for (const manager of managers ?? []) {
        await notifyUser(supabaseAdmin, (manager as any).profile_id, {
          type: "client_general_message",
          title: "Nouveau message client",
          body: "Une demande generale client a ete mise a jour.",
          link: `/clients/${client.id}`,
          entity_type: "client",
          entity_id: client.id,
        });
      }
    }

    return { id: created.id, conversation_id: conversation.id };
  });

export const markClientGeneralConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversation_id: string }) => ({
    conversation_id: z.string().uuid().parse(data.conversation_id),
  }))
  .handler(async ({ data, context }) => {
    const client = await myClientRow(context);
    const conversation = await getClientConversation(context, client.id, data.conversation_id);
    const { error } = await context.supabase
      .from("client_conversations")
      .update({ client_last_read_at: new Date().toISOString() })
      .eq("id", conversation.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createClientConversationUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    conversation_id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
  }) => ({
    conversation_id: z.string().uuid().parse(data.conversation_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    if (data.size_bytes > MAX_SIZE) throw new Error("Fichier trop volumineux (50 Mo maximum).");
    if (!CLIENT_ALLOWED_MIME.has(data.mime_type)) throw new Error("Type de fichier non autorisé.");
    const client = await myClientRow(context);
    await getClientConversation(context, client.id, data.conversation_id);
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `conversations/${data.conversation_id}/${crypto.randomUUID()}-${safeName}`;
    const { data: signed, error } = await context.supabase.storage
      .from("bar-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, signed_url: signed.signedUrl };
  });

export const getClientConversationAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { message_id: string }) => ({
    message_id: z.string().uuid().parse(data.message_id),
  }))
  .handler(async ({ data, context }) => {
    await myClientRow(context);
    const { data: message, error } = await context.supabase
      .from("client_conversation_messages")
      .select("attachment_path, attachment_name")
      .eq("id", data.message_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!message?.attachment_path) throw new Error("Pièce jointe inaccessible.");
    const { data: signed, error: signedError } = await context.supabase.storage
      .from("bar-media")
      .createSignedUrl(message.attachment_path, 300, { download: message.attachment_name ?? "document" });
    if (signedError) throw new Error(signedError.message);
    return { url: signed.signedUrl, filename: message.attachment_name ?? "document" };
  });

export const sendClientMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string; body: string; document_id?: string | null }) => ({
    matter_id: z.string().uuid().parse(d.matter_id),
    body: z.string().trim().min(1, "Le message est vide").max(5000).parse(d.body),
    document_id: d.document_id ? z.string().uuid().parse(d.document_id) : null,
  }))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("matter_messages")
      .insert({
        matter_id: data.matter_id,
        author_id: context.userId,
        body: data.body,
        internal: false,
        document_id: data.document_id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase, context.userId, data.matter_id,
      "client_message",
      "Message reçu du client",
      { entity_type: "message", entity_id: created.id },
    );

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyUser } = await import("@/lib/notify.server");
    const { data: matter } = await supabaseAdmin
      .from("matters").select("owner_id, number").eq("id", data.matter_id).maybeSingle();
    await notifyUser(supabaseAdmin, matter?.owner_id, {
      type: "client_message",
      title: "Nouveau message client",
      body: `${matter?.number ?? ""} — ${data.body.slice(0, 160)}`.trim(),
      link: `/dossiers/${data.matter_id}`,
      entity_type: "matter",
      entity_id: data.matter_id,
    });
    return { id: created.id };
  });

// ============ DOCUMENTS À SIGNER ============
export const listClientDocumentsToSign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: invoices, error } = await context.supabase
      .from("invoices")
      .select("id, number, kind, total, currency, issue_date, due_date, delivery_status, sent_at, viewed_at, signed_at, matter_id")
      .order("sent_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = invoices ?? [];
    if (rows.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: links } = await supabaseAdmin
      .from("signature_links")
      .select("invoice_id, token, active, expires_at, revoked_at, created_at")
      .in("invoice_id", rows.map((r: any) => r.id))
      .order("created_at", { ascending: false });

    const tokenByInvoice = new Map<string, { token: string; expires_at: string | null }>();
    for (const l of links ?? []) {
      if (tokenByInvoice.has(l.invoice_id)) continue;
      if (!l.active || l.revoked_at) continue;
      if (l.expires_at && new Date(l.expires_at) < new Date()) continue;
      tokenByInvoice.set(l.invoice_id, { token: l.token, expires_at: l.expires_at });
    }

    return rows.map((r: any) => ({
      ...r,
      token: tokenByInvoice.get(r.id)?.token ?? null,
      token_expires_at: tokenByInvoice.get(r.id)?.expires_at ?? null,
    }));
  });

export const refuseClientDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string; reason?: string | null }) => ({
    invoice_id: z.string().uuid().parse(d.invoice_id),
    reason: z.string().trim().max(1000).nullable().optional().parse(d.reason || null),
  }))
  .handler(async ({ data, context }) => {
    // La RLS ne laisse voir que les documents effectivement envoyés à ce client.
    const { data: inv } = await context.supabase
      .from("invoices")
      .select("id, kind, number, matter_id, owner_id, delivery_status")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (!inv) throw new Error("Document introuvable");
    if (inv.delivery_status === "signed") throw new Error("Ce document est déjà signé.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("invoices")
      .update({ delivery_status: "refused", refused_at: now, refusal_reason: data.reason })
      .eq("id", data.invoice_id);
    await supabaseAdmin
      .from("signature_links")
      .update({ active: false, revoked_at: now })
      .eq("invoice_id", data.invoice_id)
      .is("revoked_at", null);
    await supabaseAdmin.from("signature_events").insert({
      invoice_id: data.invoice_id,
      type: "refused",
      actor_id: context.userId,
      actor_label: "Client",
      metadata: { reason: data.reason },
    });
    if (inv.matter_id) {
      await supabaseAdmin.from("matter_activity").insert({
        matter_id: inv.matter_id,
        actor_id: context.userId,
        action: "document_refused",
        summary: `${inv.kind === "quote" ? "Devis" : "Facture"} ${inv.number ?? ""} refusé par le client`.trim(),
        entity_type: "invoice",
        entity_id: inv.id,
        metadata: { reason: data.reason },
      });
    }
    const { notifyUser } = await import("@/lib/notify.server");
    await notifyUser(supabaseAdmin, inv.owner_id, {
      type: "document_refused",
      title: "Document refusé par le client",
      body: `${inv.kind === "quote" ? "Devis" : "Facture"} ${inv.number ?? ""}${data.reason ? ` — ${data.reason}` : ""}`.trim(),
      link: `/facturation/${inv.id}`,
      entity_type: "invoice",
      entity_id: inv.id,
    });
    return { ok: true };
  });

// ============ TABLEAU DE BORD ============
export const getClientDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await myClientRow(context);
    const [{ data: matters }, { data: docs }, { data: invoices }, { data: messages }, { count: notificationsUnread }] = await Promise.all([
      context.supabase.from("matters").select("id, number, title, status, opened_on").order("opened_on", { ascending: false }),
      context.supabase.from("matter_documents").select("id, filename, created_at, matter_id").order("created_at", { ascending: false }).limit(5),
      context.supabase.from("invoices").select("id, number, kind, total, currency, delivery_status, sent_at").order("sent_at", { ascending: false }),
      context.supabase.from("matter_messages").select("id, body, created_at, matter_id, author_id").order("created_at", { ascending: false }).limit(5),
      context.supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", context.userId)
        .is("read_at", null),
    ]);
    const invRows = invoices ?? [];
    const unreadMessages = (messages ?? []).filter(
      (m: any) => m.author_id !== context.userId,
    ).length;
    return {
      client: { first_name: client.first_name, last_name: client.last_name, company: client.company },
      matters_total: (matters ?? []).length,
      matters_open: (matters ?? []).filter((m: any) => !["closed", "archived"].includes(m.status)).length,
      documents_total: (docs ?? []).length,
      to_sign: invRows.filter((i: any) => ["sent", "viewed", "signing"].includes(i.delivery_status)).length,
      signed: invRows.filter((i: any) => i.delivery_status === "signed").length,
      notifications_unread: notificationsUnread ?? 0,
      messages_unread: unreadMessages,
      recent_matters: (matters ?? []).slice(0, 5),
      recent_documents: docs ?? [],
      recent_messages: messages ?? [],
      pending_documents: invRows.filter((i: any) => ["sent", "viewed", "signing"].includes(i.delivery_status)).slice(0, 5),
    };
  });
