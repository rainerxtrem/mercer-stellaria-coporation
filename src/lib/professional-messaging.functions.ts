/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { withActorNames } from "@/lib/activity-log";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withSession } from "@/backend/db/execute";
import { isAccessRelatedMessagingError } from "@/lib/professional-messaging.utils";

type Context = { supabase: any; userId: string; claims?: Record<string, unknown> };

async function activeFirmId(context: Context) {
  const claimFirmId = context.claims?.firm_id;
  if (typeof claimFirmId === "string" && claimFirmId) return claimFirmId;
  const { data, error } = await context.supabase
    .from("profiles")
    .select("active_firm_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.active_firm_id) throw new Error("Aucune entreprise active sélectionnée.");
  return data.active_firm_id as string;
}

async function hasFirmModule(context: Context, firmId: string, moduleSlug: string) {
  return withSession(
    {
      role: "authenticated",
      claims: {
        ...(context.claims ?? {}),
        sub: context.userId,
        role: "authenticated",
        firm_id: firmId,
      },
    },
    async (client) => {
      const { rows } = await client.query<{ allowed: boolean }>(
        "select app_private.user_has_module($1, $2, $3) as allowed",
        [context.userId, firmId, moduleSlug],
      );
      return Boolean(rows[0]?.allowed);
    },
  );
}

async function firmConversation(context: Context, conversationId: string) {
  const firmId = await activeFirmId(context);
  const { data, error } = await context.supabase
    .from("client_conversations")
    .select(
      "id, client_id, firm_id, subject, client_last_read_at, staff_last_read_at, clients(first_name,last_name,profile_id,discord_webhook_url)",
    )
    .eq("id", conversationId)
    .eq("firm_id", firmId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Conversation introuvable ou non autorisée.");
  return data as any;
}

export const listProfessionalMessagingThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await activeFirmId(context as Context);
    if (!(await hasFirmModule(context as Context, firmId, "messaging"))) {
      throw new Error("Le module Messagerie n'est pas autorisé pour cette entreprise.");
    }
    const canReadMatters = await hasFirmModule(context as Context, firmId, "matters");
    const [{ data: conversations, error: conversationsError }, mattersResult] = await Promise.all([
      context.supabase
        .from("client_conversations")
        .select(
          "id, client_id, subject, client_last_read_at, staff_last_read_at, updated_at, clients(first_name,last_name)",
        )
        .eq("firm_id", firmId)
        .order("updated_at", { ascending: false }),
      canReadMatters
        ? context.supabase
            .from("matters")
            .select(
              "id, number, title, client_id, clients!matters_client_id_fkey(first_name,last_name)",
            )
            .eq("firm_id", firmId)
            .neq("status", "archived")
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (conversationsError) {
      if (isAccessRelatedMessagingError(conversationsError.message)) {
        return { user_id: context.userId, general: [], matters: [] };
      }
      throw new Error(conversationsError.message);
    }
    if (mattersResult.error) {
      if (isAccessRelatedMessagingError(mattersResult.error.message)) {
        return { user_id: context.userId, general: conversations ?? [], matters: [] };
      }
      throw new Error(mattersResult.error.message);
    }
    const matters = mattersResult.data ?? [];

    const conversationIds = (conversations ?? []).map((row: any) => row.id);
    const matterIds = (matters ?? []).map((row: any) => row.id);
    const [
      { data: generalMessages, error: generalError },
      { data: matterMessages, error: matterError },
    ] = await Promise.all([
      conversationIds.length
        ? context.supabase
            .from("client_conversation_messages")
            .select("id, conversation_id, author_id, body, attachment_name, created_at")
            .in("conversation_id", conversationIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      matterIds.length
        ? context.supabase
            .from("matter_messages")
            .select("id, matter_id, author_id, body, created_at")
            .in("matter_id", matterIds)
            .eq("internal", false)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (generalError) throw new Error(generalError.message);
    if (matterError) throw new Error(matterError.message);

    const latestGeneral = new Map<string, any>();
    for (const message of generalMessages ?? []) {
      if (!latestGeneral.has((message as any).conversation_id))
        latestGeneral.set((message as any).conversation_id, message);
    }
    const latestMatter = new Map<string, any>();
    for (const message of matterMessages ?? []) {
      if (!latestMatter.has((message as any).matter_id))
        latestMatter.set((message as any).matter_id, message);
    }

    return {
      user_id: context.userId,
      general: (conversations ?? []).map((conversation: any) => ({
        ...conversation,
        latest_message: latestGeneral.get(conversation.id) ?? null,
      })),
      matters: (matters ?? []).map((matter: any) => ({
        ...matter,
        latest_message: latestMatter.get(matter.id) ?? null,
      })),
    };
  });

export const listProfessionalGeneralMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversation_id: string }) => ({
    conversation_id: z.string().uuid().parse(data.conversation_id),
  }))
  .handler(async ({ data, context }) => {
    try {
      await firmConversation(context as Context, data.conversation_id);
    } catch (error) {
      if (isAccessRelatedMessagingError(error)) {
        return [];
      }
      throw error;
    }
    const { data: rows, error } = await context.supabase
      .from("client_conversation_messages")
      .select(
        "id, conversation_id, author_id, body, attachment_path, attachment_name, attachment_mime, created_at",
      )
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) {
      if (isAccessRelatedMessagingError(error.message)) {
        return [];
      }
      throw new Error(error.message);
    }
    return withActorNames(context.supabase, rows ?? [], { author_id: "author_name" });
  });

export const sendProfessionalGeneralMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversation_id: string; body: string }) => ({
    conversation_id: z.string().uuid().parse(data.conversation_id),
    body: z.string().trim().min(1, "Le message est vide").max(5000).parse(data.body),
  }))
  .handler(async ({ data, context }) => {
    let conversation;
    try {
      conversation = await firmConversation(context as Context, data.conversation_id);
    } catch (error) {
      if (isAccessRelatedMessagingError(error)) {
        return { id: null };
      }
      throw error;
    }
    const { data: created, error } = await context.supabase
      .from("client_conversation_messages")
      .insert({ conversation_id: conversation.id, author_id: context.userId, body: data.body })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase
      .from("client_conversations")
      .update({ client_last_read_at: null })
      .eq("id", conversation.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { notifyClient } = await import("@/lib/notify.server");
    await notifyClient(supabaseAdmin, conversation.clients, {
      type: "client_general_message",
      title: "Nouveau message de votre entreprise",
      body: data.body.slice(0, 160),
      link: `/portail-client/messages?conversation=${conversation.id}`,
      entity_type: "client",
      entity_id: conversation.client_id,
    });
    return { id: created.id };
  });

export const markProfessionalConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { conversation_id: string }) => ({
    conversation_id: z.string().uuid().parse(data.conversation_id),
  }))
  .handler(async ({ data, context }) => {
    try {
      await firmConversation(context as Context, data.conversation_id);
    } catch (error) {
      if (isAccessRelatedMessagingError(error)) {
        return { ok: true };
      }
      throw error;
    }
    const { error } = await context.supabase
      .from("client_conversations")
      .update({ staff_last_read_at: new Date().toISOString() })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
