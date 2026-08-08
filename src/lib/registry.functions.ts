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

export const listLawyersAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("lawyers")
      .select("*, firms(name)")
      .order("last_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

async function logAudit(context: any, entity_type: string, entity_id: string | null, action: string, summary: string) {
  await context.supabase.from("audit_log").insert({
    actor_id: context.userId,
    entity_type,
    entity_id,
    action,
    summary,
  });
}

// ============ LAWYER SCHEMA ============
const lawyerSchema = z.object({
  license: z.string().min(3).max(30),
  first_name: z.string().min(1).max(60),
  last_name: z.string().min(1).max(60),
  photo_url: z.string().url().max(500).nullable().optional(),
  firm_id: z.string().uuid().nullable().optional(),
  specialty: z.string().max(80).nullable().optional(),
  city: z.string().max(60).nullable().optional(),
  status: z.enum(["active", "suspended", "revoked"]),
  admitted_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(200).nullable().optional(),
  bio: z.string().max(2000).nullable().optional(),
});

export const upsertLawyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string } & z.infer<typeof lawyerSchema>) => {
    const { id, ...rest } = data;
    return { id, ...lawyerSchema.parse(rest) };
  })
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    if (data.id) {
      const { id, ...updates } = data;
      const { error } = await context.supabase.from("lawyers").update(updates).eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit(context, "lawyer", id, "update", `Avocat ${updates.first_name} ${updates.last_name} modifié`);
      return { id };
    } else {
      const { id: _ignored, ...insert } = data;
      const { data: created, error } = await context.supabase.from("lawyers").insert(insert).select("id").single();
      if (error) throw new Error(error.message);
      await logAudit(context, "lawyer", created.id, "create", `Avocat ${insert.first_name} ${insert.last_name} inscrit`);
      return { id: created.id };
    }
  });

export const setLawyerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; status: "active" | "suspended" | "revoked" }) => data)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("lawyers").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    const label = data.status === "active" ? "réactivé" : data.status === "suspended" ? "suspendu" : "radié";
    await logAudit(context, "lawyer", data.id, `status_${data.status}`, `Avocat ${label}`);
    return { ok: true };
  });

export const deleteLawyer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("lawyers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, "lawyer", data.id, "delete", "Avocat supprimé du registre");
    return { ok: true };
  });

// ============ FIRM ============
const firmSchema = z.object({
  number: z.string().min(2).max(30),
  name: z.string().min(2).max(120),
  address: z.string().max(200).nullable().optional(),
  manager: z.string().max(100).nullable().optional(),
  logo_url: z.string().url().max(500).nullable().optional(),
  status: z.enum(["active", "suspended", "revoked"]),
});

export const upsertFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string } & z.infer<typeof firmSchema>) => {
    const { id, ...rest } = data;
    return { id, ...firmSchema.parse(rest) };
  })
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    if (data.id) {
      const { id, ...updates } = data;
      const { error } = await context.supabase.from("firms").update(updates).eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit(context, "firm", id, "update", `Cabinet ${updates.name} modifié`);
      return { id };
    }
    const { id: _i, ...insert } = data;
    const { data: created, error } = await context.supabase.from("firms").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    await logAudit(context, "firm", created.id, "create", `Cabinet ${insert.name} enregistré`);
    return { id: created.id };
  });

export const deleteFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("firms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, "firm", data.id, "delete", "Cabinet dissous");
    return { ok: true };
  });

// ============ NEWS ============
const newsSchema = z.object({
  title: z.string().min(2).max(200),
  slug: z.string().min(2).max(200).regex(/^[a-z0-9-]+$/, "slug invalide"),
  excerpt: z.string().max(500).nullable().optional(),
  body: z.string().max(20000).nullable().optional(),
  tag: z.string().max(40).nullable().optional(),
  cover_url: z.string().url().max(500).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]),
  published_at: z.string().nullable().optional(),
});

export const upsertNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string } & z.infer<typeof newsSchema>) => {
    const { id, ...rest } = data;
    return { id, ...newsSchema.parse(rest) };
  })
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const payload = { ...data, author_id: context.userId };
    if (data.id) {
      const id = data.id;
      const { id: _drop, ...updates } = payload;
      const { error } = await context.supabase.from("news").update(updates).eq("id", id);
      if (error) throw new Error(error.message);
      await logAudit(context, "news", id, "update", `Actualité "${updates.title}" mise à jour`);
      return { id };
    }
    const { id: _i, ...insert } = payload;
    const { data: created, error } = await context.supabase.from("news").insert(insert).select("id").single();
    if (error) throw new Error(error.message);
    await logAudit(context, "news", created.id, "create", `Actualité "${insert.title}" publiée`);
    return { id: created.id };
  });

export const deleteNews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("news").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit(context, "news", data.id, "delete", "Actualité supprimée");
    return { ok: true };
  });

// ============ SITE CONTENT ============
export const upsertSiteContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { key: string; title: string; body: string }) => ({
    key: z.string().min(1).max(60).parse(data.key),
    title: z.string().max(200).parse(data.title),
    body: z.string().max(50000).parse(data.body),
  }))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase
      .from("site_content")
      .upsert({ ...data, updated_by: context.userId }, { onConflict: "key" });
    if (error) throw new Error(error.message);
    await logAudit(context, "site_content", null, "update", `Contenu "${data.key}" mis à jour`);
    return { ok: true };
  });

// ============ ROLE MANAGEMENT ============
export const grantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { user_email: string; role: "batonnier" | "avocat" | "citoyen" }) => data)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error: uerr } = await supabaseAdmin.auth.admin.listUsers();
    if (uerr) throw new Error(uerr.message);
    const target = users.users.find((u) => u.email?.toLowerCase() === data.user_email.toLowerCase());
    if (!target) throw new Error("Utilisateur introuvable.");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: target.id, role: data.role });
    if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    await logAudit(context, "user_role", target.id, "grant", `Rôle ${data.role} accordé à ${data.user_email}`);
    return { ok: true };
  });
