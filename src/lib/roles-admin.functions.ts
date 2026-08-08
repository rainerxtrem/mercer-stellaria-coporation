import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { DIRECTOR_MANAGED_ROLES, assertRoleManager, logRoleAudit } from "./roles-admin.server";

export type AppRoleServer = "batonnier" | "avocat" | "citoyen" | "assistant" | "responsable_cabinet" | "formateur" | "examinateur";

export const listUserRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string }) => ({ user_id: z.string().uuid().parse(data.user_id) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await assertRoleManager(context, data.user_id);
    const { data: rows, error } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: any) => r.role as AppRoleServer);
  });

export const setUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_id: string; roles: AppRoleServer[] }) => ({
    user_id: z.string().uuid().parse(data.user_id),
    roles: z.array(z.enum(["batonnier", "avocat", "citoyen", "assistant", "responsable_cabinet", "formateur", "examinateur"])).parse(data.roles),
  }))
  .handler(async ({ data, context }) => {
    const access = await assertRoleManager(context, data.user_id);
    const { supabaseAdmin } = access;

    // Target user identity for audit summary
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("full_name").eq("id", data.user_id).maybeSingle();
    const label = prof?.full_name ?? data.user_id;

    const { data: current, error: cerr } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.user_id);
    if (cerr) throw new Error(cerr.message);
    const currentRoles = new Set((current ?? []).map((r: any) => r.role as AppRoleServer));
    if (access.mode === "director" && data.roles.some((role) => !DIRECTOR_MANAGED_ROLES.includes(role))) {
      throw new Error("Un Directeur de cabinet ne peut gérer que les rôles Avocat, Assistant et Citoyen.");
    }
    const nextRoles = access.mode === "batonnier"
      ? new Set(data.roles)
      : new Set<AppRoleServer>([
          ...[...currentRoles].filter((role) => !DIRECTOR_MANAGED_ROLES.includes(role)),
          ...data.roles,
        ]);

    const toAdd = [...nextRoles].filter((r) => !currentRoles.has(r));
    const toRemove = [...currentRoles].filter((r) => !nextRoles.has(r));

    if (toRemove.length) {
      const { error } = await supabaseAdmin
        .from("user_roles").delete().eq("user_id", data.user_id).in("role", toRemove);
      if (error) throw new Error(error.message);
    }
    if (toAdd.length) {
      const rows = toAdd.map((role) => ({ user_id: data.user_id, role }));
      const { error } = await supabaseAdmin.from("user_roles").insert(rows);
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    }

    if (toAdd.length || toRemove.length) {
      const summary = [
        toAdd.length ? `+ ${toAdd.join(", ")}` : null,
        toRemove.length ? `− ${toRemove.join(", ")}` : null,
      ].filter(Boolean).join(" · ");
      await logRoleAudit(context, data.user_id, "roles_update", `Rôles de ${label} : ${summary}`);
    }

    return { ok: true, added: toAdd, removed: toRemove };
  });
