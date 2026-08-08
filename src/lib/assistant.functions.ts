import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ============ MATTER ASSISTANTS (share access) ============

export const listMatterAssistants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string }) => ({ matter_id: z.string().uuid().parse(d.matter_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("matter_assistants")
      .select("user_id, granted_by, created_at")
      .eq("matter_id", data.matter_id);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];
    const { data: profs } = await context.supabase
      .from("profiles").select("id, full_name").in("id", ids);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
    return (rows ?? []).map((r: any) => ({ ...r, full_name: map.get(r.user_id) ?? "Utilisateur" }));
  });

export const addMatterAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string; email: string }) => ({
    matter_id: z.string().uuid().parse(d.matter_id),
    email: z.string().trim().email().toLowerCase().parse(d.email),
  }))
  .handler(async ({ data, context }) => {
    // Confirm caller owns the matter (or direction) — RLS on matter_assistants will re-enforce
    const { data: m } = await context.supabase.from("matters").select("id, owner_id, title, number").eq("id", data.matter_id).maybeSingle();
    if (!m) throw new Error("Dossier introuvable");
    const isOwner = m.owner_id === context.userId;
    const { data: isBat } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "batonnier" });
    if (!isOwner && !isBat) throw new Error("Seul le titulaire du dossier peut partager l'accès.");

    // Find user by email via admin lookup — restricted: only owner/direction passes RLS above.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: usersData, error: e1 } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (e1) throw new Error(e1.message);
    const target = usersData.users.find((u) => (u.email ?? "").toLowerCase() === data.email);
    if (!target) throw new Error("Aucun compte trouvé pour cet email. Invitez-le d'abord à créer un compte.");
    if (target.id === m.owner_id) throw new Error("Le titulaire a déjà accès à son dossier.");

    // Ensure they have 'assistant' role (or already avocat/…): grant assistant if none of these
    const { data: rolesRows } = await context.supabase
      .from("user_roles").select("role").eq("user_id", target.id);
    const roles = (rolesRows ?? []).map((r: any) => r.role);
    if (!roles.includes("assistant") && !roles.includes("avocat") && !roles.includes("batonnier") && !roles.includes("responsable_cabinet")) {
      await supabaseAdmin.from("user_roles").insert({ user_id: target.id, role: "assistant" });
    }

    const { error } = await context.supabase
      .from("matter_assistants")
      .insert({ matter_id: data.matter_id, user_id: target.id, granted_by: context.userId });
    if (error) throw new Error(error.message);

    await context.supabase.from("matter_activity").insert({
      matter_id: data.matter_id,
      actor_id: context.userId,
      action: "assistant.added",
      summary: `Accès partagé avec ${data.email}`,
      entity_type: "user",
      entity_id: target.id,
    });
    return { ok: true };
  });

export const removeMatterAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string; user_id: string }) => ({
    matter_id: z.string().uuid().parse(d.matter_id),
    user_id: z.string().uuid().parse(d.user_id),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("matter_assistants")
      .delete()
      .eq("matter_id", data.matter_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    await context.supabase.from("matter_activity").insert({
      matter_id: data.matter_id,
      actor_id: context.userId,
      action: "assistant.removed",
      summary: `Accès retiré à un collaborateur`,
      entity_type: "user",
      entity_id: data.user_id,
    });
    return { ok: true };
  });

// ============ TASKS ============
const taskInput = z.object({
  matter_id: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["todo", "doing", "done"]).default("todo"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  assignee_id: z.string().uuid().nullable().optional(),
});

export const listTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id?: string; mine?: boolean } = {}) => d)
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("matter_tasks")
      .select("*, matters(id, number, title)")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (data.matter_id) q = q.eq("matter_id", data.matter_id);
    if (data.mine) q = q.eq("assignee_id", context.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => taskInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("matter_tasks")
      .insert({ ...data, created_by: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("matter_activity").insert({
      matter_id: data.matter_id,
      actor_id: context.userId,
      action: "task.created",
      summary: `Nouvelle tâche : ${data.title}`,
      entity_type: "task",
      entity_id: row.id,
    });
    return row;
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    status: z.enum(["todo", "doing", "done"]).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    assignee_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { data: row, error } = await context.supabase
      .from("matter_tasks").update(patch).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    await context.supabase.from("matter_activity").insert({
      matter_id: row.matter_id,
      actor_id: context.userId,
      action: "task.updated",
      summary: `Tâche mise à jour : ${row.title}`,
      entity_type: "task",
      entity_id: row.id,
    });
    return row;
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("matter_tasks").select("matter_id, title").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("matter_tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (row) {
      await context.supabase.from("matter_activity").insert({
        matter_id: row.matter_id,
        actor_id: context.userId,
        action: "task.deleted",
        summary: `Tâche supprimée : ${row.title}`,
      });
    }
    return { ok: true };
  });
