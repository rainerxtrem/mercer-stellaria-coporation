import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- CATEGORIES ----------

export const listLibraryCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("library_categories")
      .select("id, name, slug, parent_id, position")
      .order("position", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "cat";

export const upsertLibraryCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().optional(),
    parent_id: z.string().uuid().nullable().optional(),
    position: z.number().int().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload: any = {
      name: data.name,
      slug: (data.slug?.trim() || slugify(data.name)),
      parent_id: data.parent_id ?? null,
      position: data.position ?? 0,
    };
    if (data.id) {
      const { data: r, error } = await context.supabase.from("library_categories")
        .update(payload).eq("id", data.id).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      return r;
    }
    const { data: r, error } = await context.supabase.from("library_categories")
      .insert(payload).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return r;
  });

export const deleteLibraryCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("library_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ARTICLES ----------

export const listLibraryArticles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    search: z.string().optional(),
    category_id: z.string().uuid().optional(),
    tag: z.string().optional(),
    status: z.enum(["draft", "published", "archived", "all"]).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("library_articles")
      .select("id, title, slug, excerpt, tags, theme, status, category_id, attachment_name, attachment_mime, updated_at, library_categories(name, slug)")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.category_id) q = q.eq("category_id", data.category_id);
    if (data.tag) q = q.contains("tags", [data.tag]);
    if (data.search) {
      const s = data.search.replace(/[,()*%_\\"']/g, " ").trim().slice(0, 80);
      if (s) q = q.or(`title.ilike.%${s}%,excerpt.ilike.%${s}%,theme.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getLibraryArticle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("library_articles").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const upsertLibraryArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    slug: z.string().trim().optional(),
    excerpt: z.string().max(500).optional().nullable(),
    body: z.string().max(200_000).optional().nullable(),
    category_id: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().max(40)).max(30).optional(),
    theme: z.string().trim().max(80).nullable().optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    external_link: z.string().url().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload: any = {
      title: data.title,
      slug: (data.slug?.trim() || slugify(data.title + "-" + Math.random().toString(36).slice(2, 6))),
      excerpt: data.excerpt ?? null,
      body: data.body ?? null,
      category_id: data.category_id ?? null,
      tags: data.tags ?? [],
      theme: data.theme ?? null,
      status: data.status ?? "draft",
      external_link: data.external_link ?? null,
    };
    if (data.id) {
      const { data: r, error } = await context.supabase.from("library_articles")
        .update(payload).eq("id", data.id).select("id").maybeSingle();
      if (error) throw new Error(error.message);
      return r;
    }
    const { data: r, error } = await context.supabase.from("library_articles")
      .insert(payload).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return r;
  });

export const toggleLibraryPublication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    status: z.enum(["draft", "published", "archived"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("library_articles").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteLibraryArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Best-effort: supprimer la pièce jointe si présente
    const { data: art } = await context.supabase
      .from("library_articles").select("attachment_path").eq("id", data.id).maybeSingle();
    const path = (art as any)?.attachment_path as string | null;
    if (path) await context.supabase.storage.from("bar-library").remove([path]);
    const { error } = await context.supabase.from("library_articles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ATTACHMENTS ----------

export const createLibraryUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    article_id: z.string().uuid(),
    filename: z.string().trim().min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `articles/${data.article_id}/${Date.now()}-${safe}`;
    const { data: signed, error } = await context.supabase.storage
      .from("bar-library").createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path: signed.path, token: signed.token };
  });

export const finalizeLibraryAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    attachment_path: z.string().min(1),
    attachment_name: z.string().min(1).max(200),
    attachment_mime: z.string().min(1).max(120),
    attachment_size: z.number().int().nonnegative(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Supprimer l'ancienne pièce jointe si présente
    const { data: prev } = await context.supabase
      .from("library_articles").select("attachment_path").eq("id", data.id).maybeSingle();
    const prevPath = (prev as any)?.attachment_path as string | null;
    if (prevPath && prevPath !== data.attachment_path) {
      await context.supabase.storage.from("bar-library").remove([prevPath]);
    }
    const { error } = await context.supabase.from("library_articles").update({
      attachment_path: data.attachment_path,
      attachment_name: data.attachment_name,
      attachment_mime: data.attachment_mime,
      attachment_size: data.attachment_size,
    } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeLibraryAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: art } = await context.supabase
      .from("library_articles").select("attachment_path").eq("id", data.id).maybeSingle();
    const path = (art as any)?.attachment_path as string | null;
    if (path) await context.supabase.storage.from("bar-library").remove([path]);
    const { error } = await context.supabase.from("library_articles").update({
      attachment_path: null, attachment_name: null, attachment_mime: null, attachment_size: null,
    } as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getLibraryAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: art } = await context.supabase
      .from("library_articles")
      .select("attachment_path, attachment_name, status")
      .eq("id", data.id).maybeSingle();
    const path = (art as any)?.attachment_path as string | null;
    if (!path) throw new Error("Aucune pièce jointe.");
    const { data: signed, error } = await context.supabase.storage
      .from("bar-library").createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, filename: (art as any)?.attachment_name ?? "document" };
  });
