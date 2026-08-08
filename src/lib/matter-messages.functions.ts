import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withActorNames } from "@/lib/activity-log";
import { z } from "zod";

/** Conversation d'un dossier, vue cabinet : inclut les notes internes. */
export const listMatterMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string }) => ({ matter_id: z.string().uuid().parse(d.matter_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("matter_messages")
      .select("*, matter_documents(id, filename, mime_type, size_bytes)")
      .eq("matter_id", data.matter_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return withActorNames(context.supabase, rows ?? [], { author_id: "author_name" });
  });

export const sendMatterMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string; body: string; internal?: boolean; document_id?: string | null }) => ({
    matter_id: z.string().uuid().parse(d.matter_id),
    body: z.string().trim().min(1, "Le message est vide").max(5000).parse(d.body),
    internal: z.boolean().optional().default(false).parse(d.internal ?? false),
    document_id: d.document_id ? z.string().uuid().parse(d.document_id) : null,
  }))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("matter_messages")
      .insert({
        matter_id: data.matter_id,
        author_id: context.userId,
        body: data.body,
        internal: data.internal,
        document_id: data.document_id,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase,
      context.userId,
      data.matter_id,
      data.internal ? "note_internal" : "message_sent",
      data.internal ? "Note interne ajoutée" : "Message envoyé au client",
      { entity_type: "message", entity_id: created.id },
    );

    if (!data.internal) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { notifyClient } = await import("@/lib/notify.server");
      const { data: matter } = await supabaseAdmin
        .from("matters").select("number, title").eq("id", data.matter_id).maybeSingle();
      const { data: links } = await supabaseAdmin
        .from("matter_clients")
        .select("clients(profile_id, discord_webhook_url)")
        .eq("matter_id", data.matter_id);
      for (const l of links ?? []) {
        await notifyClient(supabaseAdmin, (l as any).clients, {
          type: "matter_message",
          title: "Nouveau message de votre cabinet",
          body: `${matter?.number ?? ""} — ${data.body.slice(0, 160)}`.trim(),
          link: `/portail-client/messages?dossier=${data.matter_id}`,
          entity_type: "matter",
          entity_id: data.matter_id,
        });
      }
    }
    return { id: created.id };
  });

export const deleteMatterMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("matter_messages")
      .delete()
      .eq("id", data.id)
      .eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
