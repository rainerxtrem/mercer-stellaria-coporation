import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertBatonnier(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r: { role: string }) => r.role === "batonnier")) {
    throw new Error("Accès refusé : rôla direction requis.");
  }
}

export const listContactRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { data, error } = await context.supabase
      .from("contact_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateContactStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: "nouveau" | "en_cours" | "traite" | "archive" }) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["nouveau", "en_cours", "traite", "archive"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase
      .from("contact_requests")
      .update({ status: data.status, handled_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContactRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("contact_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
