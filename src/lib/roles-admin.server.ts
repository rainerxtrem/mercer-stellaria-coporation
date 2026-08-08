import type { AppRoleServer } from "./roles-admin.functions";

export const DIRECTOR_MANAGED_ROLES: AppRoleServer[] = ["avocat", "citoyen", "assistant"];

export async function getActorRoles(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => r.role as AppRoleServer);
}

export async function getFirmForUser(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("lawyers")
    .select("firm_id")
    .eq("profile_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.firm_id ?? null) as string | null;
}

export async function assertRoleManager(context: { supabase: any; userId: string }, targetUserId: string) {
  const actorRoles = await getActorRoles(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (actorRoles.includes("batonnier")) return { mode: "batonnier" as const, supabaseAdmin };

  if (!actorRoles.includes("responsable_cabinet")) {
    throw new Error("Accès refusé : rôla direction ou Directeur de cabinet requis.");
  }

  const [actorFirmId, targetFirmId] = await Promise.all([
    getFirmForUser(supabaseAdmin, context.userId),
    getFirmForUser(supabaseAdmin, targetUserId),
  ]);
  if (!actorFirmId || actorFirmId !== targetFirmId) {
    throw new Error("Accès refusé : vous ne pouvez gérer que les membres de votre cabinet.");
  }
  return { mode: "director" as const, supabaseAdmin };
}

export async function logRoleAudit(context: any, entity_id: string, action: string, summary: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_log").insert({
    actor_id: context.userId,
    entity_type: "user_role",
    entity_id,
    action,
    summary,
  });
}