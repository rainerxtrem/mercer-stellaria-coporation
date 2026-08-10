import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BUCKET = "firm-templates";

async function getRoles(ctx: { supabase: any; userId: string }): Promise<string[]> {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  return (data ?? []).map((r: any) => r.role as string);
}

async function getActiveFirmId(ctx: { supabase: any; userId: string; claims?: Record<string, unknown> }): Promise<string | null> {
  const fromClaims = (ctx.claims?.firm_id as string | undefined) ?? null;
  if (fromClaims) return fromClaims;
  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("active_firm_id")
    .eq("id", ctx.userId)
    .maybeSingle();
  return (profile?.active_firm_id as string | null) ?? null;
}

/** Résout le cabinet cible + les droits de l'utilisateur courant. */
async function resolveScope(context: any, firmId?: string) {
  const roles = await getRoles(context);
  const isBatonnier = roles.includes("batonnier");
  const myFirmId = await getActiveFirmId(context);
  const targetFirmId = (isBatonnier ? (firmId ?? myFirmId) : myFirmId) ?? null;
  if (firmId && !isBatonnier && firmId !== myFirmId) {
    throw new Error("Accès refusé à ce cabinet.");
  }
  const canManage = Boolean(targetFirmId);
  return { roles, isBatonnier, myFirmId, targetFirmId, canManage };
}

async function assertCategoryInFirm(context: any, categoryId: string | null | undefined, firmId: string) {
  if (!categoryId) return;
  const { data, error } = await context.supabase
    .from("doc_template_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("firm_id", firmId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Le dossier sélectionné n'appartient pas à l'entreprise active.");
}

function assertManage(scope: { canManage: boolean }) {
  if (!scope.canManage) throw new Error("Accès refusé : vous devez être rattaché à un cabinet.");
}

/** Contexte d'accès pour l'interface. */
export const getTemplateAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const scope = await resolveScope(context);
    let firmName: string | null = null;
    if (scope.targetFirmId) {
      const { data } = await context.supabase
        .from("firms").select("name").eq("id", scope.targetFirmId).maybeSingle();
      firmName = (data as any)?.name ?? null;
    }
    return {
      firmId: scope.targetFirmId,
      firmName,
      canManage: scope.canManage,
      isBatonnier: scope.isBatonnier,
    };
  });

// ---------------- CATEGORIES / DOSSIERS ----------------

export const listTemplateCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ firmId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context, data.firmId);
    if (!scope.targetFirmId) return [];
    const { data: rows, error } = await context.supabase
      .from("doc_template_categories")
      .select("id, firm_id, parent_id, name, position")
      .eq("firm_id", scope.targetFirmId)
      .order("position", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertTemplateCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    firmId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(120),
    parent_id: z.string().uuid().nullable().optional(),
    position: z.number().int().min(0).max(9999).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context, data.firmId);
    assertManage(scope);
    if (!scope.targetFirmId) throw new Error("Aucun cabinet cible.");
    const payload = {
      firm_id: scope.targetFirmId,
      name: data.name,
      parent_id: data.parent_id ?? null,
      position: data.position ?? 0,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("doc_template_categories").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("doc_template_categories")
      .insert({ ...payload, created_by: context.userId })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: (created as any).id as string };
  });

export const deleteTemplateCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context);
    assertManage(scope);
    const { error } = await context.supabase
      .from("doc_template_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- TEMPLATES ----------------

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    firmId: z.string().uuid().optional(),
    search: z.string().max(120).optional(),
    category_id: z.string().uuid().optional(),
    includeArchived: z.boolean().optional(),
    onlyActive: z.boolean().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context, data.firmId);
    if (!scope.targetFirmId) return [];
    let q = context.supabase
      .from("doc_templates")
      .select("id, firm_id, category_id, name, description, kind, active, archived, current_version, created_at, updated_at, updated_by, doc_template_categories(name)")
      .eq("firm_id", scope.targetFirmId)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (!data.includeArchived) q = q.eq("archived", false);
    if (data.onlyActive) q = q.eq("active", true);
    if (data.category_id) q = q.eq("category_id", data.category_id);
    if (data.search) {
      const s = data.search.replace(/[,()*%_\\"'.]/g, " ").trim().slice(0, 80);
      if (s) q = q.or(`name.ilike.%${s}%,description.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tpl, error } = await context.supabase
      .from("doc_templates").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!tpl) throw new Error("Modèle introuvable.");
    const { data: versions } = await context.supabase
      .from("doc_template_versions")
      .select("id, version, file_name, mime_type, size_bytes, note, fields, created_at, created_by")
      .eq("template_id", data.id)
      .order("version", { ascending: false });
    return { template: tpl, versions: versions ?? [] };
  });

/** Crée une URL d'import signée pour un fichier de modèle (DOCX ou PDF). */
export const createTemplateUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    firmId: z.string().uuid().optional(),
    filename: z.string().trim().min(1).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context, data.firmId);
    assertManage(scope);
    if (!scope.targetFirmId) throw new Error("Aucun cabinet cible.");
    const safe = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const path = `${scope.targetFirmId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path: signed.path, token: signed.token };
  });

const fileSchema = z.object({
  storage_path: z.string().min(1).max(400),
  file_name: z.string().trim().min(1).max(200),
  mime_type: z.string().trim().min(1).max(120),
  size_bytes: z.number().int().nonnegative().max(50_000_000),
});

function kindFromMime(mime: string, filename: string): "pdf" | "docx" {
  if (mime.includes("pdf") || filename.toLowerCase().endsWith(".pdf")) return "pdf";
  return "docx";
}

/** Crée un modèle avec sa version 1. */
export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    firmId: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().max(1000).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    file: fileSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context, data.firmId);
    assertManage(scope);
    if (!scope.targetFirmId) throw new Error("Aucun cabinet cible.");
    await assertCategoryInFirm(context, data.category_id, scope.targetFirmId);
    const kind = kindFromMime(data.file.mime_type, data.file.file_name);
    const { data: tpl, error } = await context.supabase
      .from("doc_templates")
      .insert({
        firm_id: scope.targetFirmId,
        category_id: data.category_id ?? null,
        name: data.name,
        description: data.description ?? null,
        kind,
        active: true,
        archived: false,
        current_version: 1,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id").single();
    if (error) throw new Error(error.message);
    const templateId = (tpl as any).id as string;
    const { error: vErr } = await context.supabase
      .from("doc_template_versions")
      .insert({
        template_id: templateId,
        version: 1,
        storage_path: data.file.storage_path,
        file_name: data.file.file_name,
        mime_type: data.file.mime_type,
        size_bytes: data.file.size_bytes,
        created_by: context.userId,
      });
    if (vErr) {
      await context.supabase.from("doc_templates").delete().eq("id", templateId);
      throw new Error(vErr.message);
    }
    return { id: templateId, kind };
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    active: z.boolean().optional(),
    archived: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context);
    assertManage(scope);
    const { data: existing, error: existingError } = await context.supabase
      .from("doc_templates")
      .select("firm_id")
      .eq("id", data.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Modèle introuvable.");
    if (data.category_id !== undefined) {
      await assertCategoryInFirm(context, data.category_id, (existing as any).firm_id as string);
    }
    const patch: any = {};
    if (data.name !== undefined) patch['name'] = data.name;
    if (data.description !== undefined) patch['description'] = data.description;
    if (data.category_id !== undefined) patch['category_id'] = data.category_id;
    if (data.active !== undefined) patch['active'] = data.active;
    if (data.archived !== undefined) patch['archived'] = data.archived;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("doc_templates").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Publie une nouvelle version : les documents déjà générés restent liés à l'ancienne. */
export const publishTemplateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    template_id: z.string().uuid(),
    note: z.string().trim().max(500).nullable().optional(),
    file: fileSchema,
  }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context);
    assertManage(scope);
    const { data: tpl, error: tErr } = await context.supabase
      .from("doc_templates").select("id, current_version").eq("id", data.template_id).maybeSingle();
    if (tErr) throw new Error(tErr.message);
    if (!tpl) throw new Error("Modèle introuvable.");
    const next = ((tpl as any).current_version ?? 1) + 1;
    const kind = kindFromMime(data.file.mime_type, data.file.file_name);
    const { error: vErr } = await context.supabase
      .from("doc_template_versions")
      .insert({
        template_id: data.template_id,
        version: next,
        storage_path: data.file.storage_path,
        file_name: data.file.file_name,
        mime_type: data.file.mime_type,
        size_bytes: data.file.size_bytes,
        note: data.note ?? null,
        created_by: context.userId,
      });
    if (vErr) throw new Error(vErr.message);
    const { error: uErr } = await context.supabase
      .from("doc_templates").update({ current_version: next, kind }).eq("id", data.template_id);
    if (uErr) throw new Error(uErr.message);
    return { version: next };
  });

/** Duplique un modèle et son fichier courant. */
export const duplicateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context);
    assertManage(scope);
    const { data: tpl, error } = await context.supabase
      .from("doc_templates").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!tpl) throw new Error("Modèle introuvable.");
    const t = tpl as any;
    const { data: ver } = await context.supabase
      .from("doc_template_versions")
      .select("*").eq("template_id", data.id)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (!ver) throw new Error("Aucun fichier à dupliquer.");
    const v = ver as any;

    const copyPath = `${t.firm_id}/${Date.now()}-copie-${(v.file_name as string).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: cpErr } = await context.supabase.storage.from(BUCKET).copy(v.storage_path, copyPath);
    if (cpErr) throw new Error(cpErr.message);

    const { data: created, error: iErr } = await context.supabase
      .from("doc_templates")
      .insert({
        firm_id: t.firm_id,
        category_id: t.category_id,
        name: `${t.name} (copie)`,
        description: t.description,
        kind: t.kind,
        active: false,
        archived: false,
        current_version: 1,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id").single();
    if (iErr) throw new Error(iErr.message);
    const newId = (created as any).id as string;
    const { error: vErr } = await context.supabase.from("doc_template_versions").insert({
      template_id: newId,
      version: 1,
      storage_path: copyPath,
      file_name: v.file_name,
      mime_type: v.mime_type,
      size_bytes: v.size_bytes,
      fields: v.fields ?? [],
      body_text: v.body_text ?? null,
      created_by: context.userId,
    });
    if (vErr) throw new Error(vErr.message);
    return { id: newId };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context);
    assertManage(scope);
    const { data: versions } = await context.supabase
      .from("doc_template_versions").select("storage_path").eq("template_id", data.id);
    const paths = (versions ?? []).map((v: any) => v.storage_path as string).filter(Boolean);
    if (paths.length) await context.supabase.storage.from(BUCKET).remove(paths);
    const { error } = await context.supabase.from("doc_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** URL signée de téléchargement du fichier d'une version (ou de la version courante). */
export const getTemplateFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    template_id: z.string().uuid().optional(),
    version_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let row: any = null;
    if (data.version_id) {
      const { data: v } = await context.supabase
        .from("doc_template_versions")
        .select("storage_path, file_name").eq("id", data.version_id).maybeSingle();
      row = v;
    } else if (data.template_id) {
      const { data: v } = await context.supabase
        .from("doc_template_versions")
        .select("storage_path, file_name").eq("template_id", data.template_id)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      row = v;
    }
    if (!row?.storage_path) throw new Error("Fichier introuvable.");
    const { data: signed, error } = await context.supabase.storage
      .from(BUCKET).createSignedUrl(row.storage_path, 300);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl, filename: row.file_name as string };
  });

// ---------------- LOT 2 : DÉTECTION DES VARIABLES & PARAMÉTRAGE ----------------

const templateFieldSchema = z.object({
  token: z.string().min(1).max(200),
  key: z.string().min(1).max(60),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["text", "textarea", "number", "date", "currency"]),
  source: z.string().min(1).max(60),
  required: z.boolean(),
  default_value: z.string().max(500).nullable().optional(),
  occurrences: z.number().int().nonnegative().optional(),
  semantic: z.string().max(40).nullable().optional(),
  format: z.string().max(20).nullable().optional(),
  detection: z.enum(["placeholder", "blank", "semantic", "manual"]).nullable().optional(),
  anchor: z.string().max(500).nullable().optional(),
  context: z.string().max(300).nullable().optional(),
  group: z.string().max(40).nullable().optional(),
});


/** Résout la version ciblée (explicite ou dernière) d'un modèle. */
async function resolveVersion(context: any, input: { template_id?: string; version_id?: string }) {
  let q = context.supabase
    .from("doc_template_versions")
    .select("id, template_id, version, storage_path, file_name, mime_type, fields, body_text");
  if (input.version_id) q = q.eq("id", input.version_id).limit(1);
  else q = q.eq("template_id", input.template_id!).order("version", { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Version de modèle introuvable.");
  return data as any;
}

/** Champs déjà paramétrés d'une version. */
export const getTemplateFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    template_id: z.string().uuid().optional(),
    version_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const v = await resolveVersion(context, data);
    return {
      version_id: v.id as string,
      template_id: v.template_id as string,
      version: v.version as number,
      file_name: v.file_name as string,
      fields: Array.isArray(v.fields) ? v.fields : [],
      has_text: !!v.body_text,
    };
  });

/** Analyse le fichier (DOCX/PDF) : extraction du texte, détection des variables, proposition IA. */
export const analyzeTemplateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    template_id: z.string().uuid().optional(),
    version_id: z.string().uuid().optional(),
    persist: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context);
    assertManage(scope);
    const v = await resolveVersion(context, data);

    const { data: blob, error: dlErr } = await context.supabase.storage.from(BUCKET).download(v.storage_path);
    if (dlErr || !blob) throw new Error(dlErr?.message ?? "Fichier du modèle illisible.");
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const { extractDocument, analyzeDocument, sanitizeUnicode, sanitizeDeep } =
      await import("@/lib/doc-template-analysis.server");

    const doc = extractDocument(bytes, v.mime_type as string, v.file_name as string);
    const text = sanitizeUnicode(doc.text);

    if (!text && doc.blanks.length === 0) {
      return {
        version_id: v.id as string,
        fields: [] as any[],
        ai: false,
        note: "Aucun texte exploitable n'a pu être extrait de ce fichier (document scanné ?). Ajoutez les champs manuellement.",
      };
    }
    const { fields, ai, note, stats } = await analyzeDocument(doc);

    // Conserve les réglages déjà validés par l'utilisateur (par clé, puis par jeton).
    const existing: any[] = Array.isArray(v.fields) ? v.fields : [];
    const byKey = new Map(existing.map((f: any) => [f?.key, f]));
    const byToken = new Map(existing.map((f: any) => [f?.token, f]));
    const merged = fields.map((f) => {
      const prev = byKey.get(f.key) ?? byToken.get(f.token);
      return prev
        ? {
            ...f,
            label: prev.label ?? f.label,
            type: prev.type ?? f.type,
            source: prev.source ?? f.source,
            required: typeof prev.required === "boolean" ? prev.required : f.required,
            format: prev.format ?? f.format,
            semantic: prev.semantic ?? f.semantic,
            default_value: prev.default_value ?? null,
          }
        : f;
    });

    const safeMerged = sanitizeDeep(merged);

    if (data.persist !== false) {
      const { error } = await context.supabase
        .from("doc_template_versions")
        .update({ fields: safeMerged, body_text: text.slice(0, 200_000) })
        .eq("id", v.id);
      if (error) throw new Error(error.message);
    }

    return {
      version_id: v.id as string,
      fields: safeMerged,

      ai,
      note: note ?? null,
      detected_count: merged.length,
      stats,
      text_length: text.length,

    };
  });

/** Enregistre le paramétrage manuel des champs d'une version. */
export const saveTemplateFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    version_id: z.string().uuid(),
    fields: z.array(templateFieldSchema).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context);
    assertManage(scope);
    const keys = new Set<string>();
    for (const f of data.fields) {
      if (keys.has(f.key)) throw new Error(`Clé en doublon : ${f.key}`);
      keys.add(f.key);
    }
    const { sanitizeDeep } = await import("@/lib/doc-template-analysis.server");
    const { error } = await context.supabase
      .from("doc_template_versions")
      .update({ fields: sanitizeDeep(data.fields) })
      .eq("id", data.version_id);

    if (error) throw new Error(error.message);
    return { ok: true, count: data.fields.length };
  });

// ---------------- LOT 3 : GÉNÉRATION / APERÇU / ENREGISTREMENT ----------------

const placementSchema = z.object({
  page: z.number().int().min(1).max(50),
  x: z.number().min(0).max(2000),
  y: z.number().min(0).max(2000),
  width: z.number().min(30).max(500),
  height: z.number().min(15).max(300),
});

const generationInputSchema = z.object({
  template_id: z.string().uuid().optional(),
  version_id: z.string().uuid().optional(),
  values: z.record(z.string().max(80), z.string().max(4000).nullable()).default({}),
  signature: z.object({
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    method: z.enum(["drawn", "generated"]),
    style: z.string().trim().max(40).nullable().optional(),
    image_base64: z.string().min(100).max(4_000_000),
    placements: z.array(placementSchema).min(1).max(10),
  }).nullable().optional(),
});

async function ensureVersionText(context: any, version: any): Promise<string> {
  const existing = typeof version.body_text === "string" ? version.body_text.trim() : "";
  if (existing) return existing;
  const { data: blob, error: dlErr } = await context.supabase.storage.from(BUCKET).download(version.storage_path);
  if (dlErr || !blob) throw new Error(dlErr?.message ?? "Fichier du modèle illisible.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const { extractDocument, sanitizeUnicode } = await import("@/lib/doc-template-analysis.server");
  const doc = extractDocument(bytes, version.mime_type as string, version.file_name as string);
  return sanitizeUnicode(doc.text ?? "").slice(0, 200_000);
}

async function downloadVersionBytes(context: any, version: any): Promise<Uint8Array> {
  const { data: blob, error: dlErr } = await context.supabase.storage.from(BUCKET).download(version.storage_path);
  if (dlErr || !blob) throw new Error(dlErr?.message ?? "Fichier du modèle illisible.");
  return new Uint8Array(await blob.arrayBuffer());
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeValue(raw: unknown): string {
  return String(raw ?? "").replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
}

function tokenToFieldName(token: string) {
  return token
    .replace(/^\{\{\s*|\s*\}\}$/g, "")
    .replace(/^\[\[\s*|\s*\]\]$/g, "")
    .trim();
}

async function buildNativePdfFromTemplate(input: {
  templateBytes: Uint8Array;
  fields: any[];
  values: Record<string, string | null>;
  signature?: {
    first_name: string;
    last_name: string;
    method: "drawn" | "generated";
    style?: string | null;
    image_base64: string;
    placements: Array<{ page: number; x: number; y: number; width: number; height: number }>;
  } | null;
}) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const { base64ToBytes } = await import("@/lib/signature-utils");

  const pdf = await PDFDocument.load(input.templateBytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const allFields = form.getFields();
  const fieldsByName = new Map(allFields.map((f: any) => [String(f.getName()), f]));

  let matched = 0;
  for (const f of input.fields) {
    const key = String(f?.key ?? "").trim();
    if (!key) continue;
    const value = normalizeValue(input.values[key] ?? f?.default_value ?? "");
    if (!value) continue;

    const names = [
      key,
      tokenToFieldName(String(f?.token ?? "")),
      String(f?.label ?? "").trim(),
    ].filter((v, i, arr) => Boolean(v) && arr.indexOf(v) === i);

    let target: any = null;
    for (const name of names) {
      target = fieldsByName.get(name)
        ?? allFields.find((x: any) => String(x.getName()).toLowerCase() === name.toLowerCase())
        ?? null;
      if (target) break;
    }
    if (!target) continue;

    const kind = target?.constructor?.name ?? "";
    try {
      if (kind === "PDFTextField") {
        target.setText(value);
        matched += 1;
      } else if (kind === "PDFDropdown") {
        target.select(value);
        matched += 1;
      } else if (kind === "PDFCheckBox") {
        if (/^(1|true|oui|yes|x)$/i.test(value)) target.check();
        else target.uncheck();
        matched += 1;
      }
    } catch {
      // Ignore unsupported field type/value mismatch and continue.
    }
  }

  if (matched > 0) {
    try {
      form.flatten();
    } catch {
      // Some PDFs cannot be flattened; keep interactive fields in that case.
    }
  }

  if (input.signature) {
    const jpeg = await pdf.embedJpg(base64ToBytes(input.signature.image_base64));
    const pages = pdf.getPages();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const signedAt = new Date().toISOString();
    for (const p of input.signature.placements) {
      const pageIdx = Math.max(0, Math.min((p.page || 1) - 1, pages.length - 1));
      const page = pages[pageIdx];
      if (!page) continue;
      const w = Math.max(40, Math.min(p.width, page.getWidth()));
      const h = Math.max(20, Math.min(p.height, page.getHeight()));
      const x = Math.max(0, Math.min(p.x, page.getWidth() - w));
      const y = Math.max(0, page.getHeight() - p.y - h);
      page.drawImage(jpeg, { x, y, width: w, height: h });
      page.drawLine({ start: { x, y: Math.max(0, y - 3) }, end: { x: x + w, y: Math.max(0, y - 3) }, thickness: 0.5, color: rgb(0.78, 0.8, 0.84) });
      page.drawText(
        `${input.signature.first_name} ${input.signature.last_name} — signe le ${formatDateTime(signedAt)}`,
        { x, y: Math.max(0, y - 12), size: 6, font, color: rgb(0.42, 0.43, 0.48) },
      );
    }
  }

  return {
    bytes: new Uint8Array(await pdf.save()),
    matchedFields: matched,
  };
}

function fillTemplateText(base: string, fields: any[], values: Record<string, string | null>) {
  let out = base;
  const used = new Set<string>();

  for (const f of fields) {
    const key = String(f?.key ?? "").trim();
    if (!key || used.has(key)) continue;
    used.add(key);
    const token = String(f?.token ?? "").trim();
    const val = normalizeValue(values[key] ?? f?.default_value ?? "");
    if (!token) continue;
    out = out.replace(new RegExp(escapeRe(token), "g"), val || "");
  }

  const unresolved = out.match(/\{\{\s*[^{}]{1,120}\s*\}\}|\[\[\s*[^\[\]]{1,120}\s*\]\]/g) ?? [];
  if (unresolved.length > 0) {
    out += "\n\n---\nChamps restant à compléter:\n";
    for (const token of Array.from(new Set(unresolved)).slice(0, 100)) out += `- ${token}\n`;
  }

  return out.trim();
}

async function buildGeneratedPdf(input: {
  title: string;
  content: string;
  metadataLines: string[];
  signature?: {
    first_name: string;
    last_name: string;
    method: "drawn" | "generated";
    style?: string | null;
    image_base64: string;
    placements: Array<{ page: number; x: number; y: number; width: number; height: number }>;
  } | null;
}) {
  const { PDF_COLORS, SimplePdfDocument, wrapText } = await import("@/lib/pdf/simple-pdf");
  const { base64ToBytes } = await import("@/lib/signature-utils");

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const left = 52;
  const right = 543;

  const doc = new SimplePdfDocument(PAGE_W, PAGE_H);
  let y = 800;

  const drawHeader = () => {
    doc.text("Mercer & Stellaria Corporation", left, 816, { size: 9, font: "bold", color: PDF_COLORS.navy });
    doc.text("Générateur documentaire", right, 816, { size: 8, color: PDF_COLORS.gray, align: "right" });
    doc.text(input.title.slice(0, 96), left, 792, { size: 16, font: "bold", color: PDF_COLORS.navy });
    doc.line(left, 782, right, 782, PDF_COLORS.border, 0.8);
    y = 764;
  };

  const ensure = (required: number) => {
    if (y > required) return;
    doc.addPage(PAGE_W, PAGE_H);
    drawHeader();
  };

  drawHeader();

  for (const line of input.metadataLines) {
    for (const wrapped of wrapText(line, right - left, 8, "regular")) {
      ensure(100);
      doc.text(wrapped, left, y, { size: 8, color: PDF_COLORS.gray });
      y -= 11;
    }
  }

  if (input.metadataLines.length) {
    y -= 6;
    doc.line(left, y, right, y, PDF_COLORS.border, 0.5);
    y -= 14;
  }

  const paragraphs = input.content
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((p) => p.trimEnd());

  for (const para of paragraphs) {
    if (!para.trim()) {
      y -= 8;
      continue;
    }
    const lines = wrapText(para, right - left, 10, "regular");
    for (const ln of lines) {
      ensure(100);
      doc.text(ln, left, y, { size: 10, color: PDF_COLORS.navy });
      y -= 14;
    }
    y -= 2;
  }

  if (input.signature) {
    const jpeg = base64ToBytes(input.signature.image_base64);
    const ref = doc.addJpeg(jpeg);
    const signedAt = new Date().toISOString();
    for (const p of input.signature.placements) {
      const pageIndex = Math.max(0, Math.min((p.page || 1) - 1, doc.pageCount - 1));
      doc.selectPage(pageIndex);
      const w = Math.max(40, Math.min(p.width, PAGE_W));
      const h = Math.max(20, Math.min(p.height, PAGE_H));
      const x = Math.max(0, Math.min(p.x, PAGE_W - w));
      const yBottom = Math.max(0, PAGE_H - p.y - h);
      doc.drawImage(ref, x, yBottom, w, h);
      doc.line(x, yBottom - 3, x + w, yBottom - 3, PDF_COLORS.border, 0.5);
      doc.text(
        `${input.signature.first_name} ${input.signature.last_name} — signé le ${formatDateTime(signedAt)}`,
        x,
        yBottom - 13,
        { size: 6, color: PDF_COLORS.gray },
      );
    }
  }

  return doc.save();
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} à ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function toSafePdfName(raw: string) {
  const stripped = raw.replace(/\.[a-zA-Z0-9]{1,5}$/, "");
  const safe = stripped.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_{2,}/g, "_").slice(0, 120);
  return safe || "document_genere";
}

async function resolveMatterAndFolder(context: any, matterId: string, folderId: string | null, firmId: string) {
  const { data: matter, error: mErr } = await context.supabase
    .from("matters")
    .select("id, number, title, firm_id")
    .eq("id", matterId)
    .eq("firm_id", firmId)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!matter) throw new Error("Dossier introuvable ou non accessible.");

  if (folderId) {
    const { data: folder, error: fErr } = await context.supabase
      .from("matter_folders")
      .select("id, matter_id")
      .eq("id", folderId)
      .maybeSingle();
    if (fErr) throw new Error(fErr.message);
    if (!folder || folder.matter_id !== matterId) {
      throw new Error("Le dossier de destination n'appartient pas au dossier client sélectionné.");
    }
  }

  return matter as { id: string; number: string | null; title: string | null; firm_id: string };
}

async function generateDocumentBytes(context: any, input: z.infer<typeof generationInputSchema>) {
  const scope = await resolveScope(context);
  if (!scope.targetFirmId) throw new Error("Aucun cabinet actif.");
  const version = await resolveVersion(context, input);

  const { data: tpl, error: tErr } = await context.supabase
    .from("doc_templates")
    .select("id, firm_id, name, current_version")
    .eq("id", version.template_id)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!tpl) throw new Error("Modèle introuvable.");
  if ((tpl as any).firm_id !== scope.targetFirmId) {
    throw new Error("Ce modèle n'appartient pas à l'entreprise active.");
  }

  const fields = Array.isArray(version.fields) ? version.fields : [];
  const hasInputValues = Object.values(input.values ?? {}).some((v) => normalizeValue(v).length > 0);

  const isPdf = String(version.mime_type ?? "").includes("pdf") || String(version.file_name ?? "").toLowerCase().endsWith(".pdf");
  if (isPdf) {
    const templateBytes = await downloadVersionBytes(context, version);
    const native = await buildNativePdfFromTemplate({
      templateBytes,
      fields,
      values: input.values ?? {},
      signature: input.signature ?? null,
    });
    if (native.matchedFields > 0 || !hasInputValues) {
      return {
        bytes: native.bytes,
        templateId: String((tpl as any).id),
        templateName: String((tpl as any).name ?? "Document"),
        version: Number(version.version ?? 1),
      };
    }
  }

  const text = await ensureVersionText(context, version);
  const filled = fillTemplateText(text, fields, input.values ?? {});
  const metadataLines = [
    `Version ${version.version} · ${version.file_name}`,
    `Généré le ${new Date().toLocaleString("fr-FR")}`,
  ];
  const bytes = await buildGeneratedPdf({
    title: String((tpl as any).name ?? "Document"),
    content: filled,
    metadataLines,
    signature: input.signature ?? null,
  });

  return {
    bytes,
    templateId: String((tpl as any).id),
    templateName: String((tpl as any).name ?? "Document"),
    version: Number(version.version ?? 1),
  };
}

export const previewGeneratedTemplatePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generationInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const out = await generateDocumentBytes(context, data);
    return {
      filename: `${toSafePdfName(out.templateName)}-v${out.version}.pdf`,
      base64: Buffer.from(out.bytes).toString("base64"),
      size_bytes: out.bytes.length,
      generated_at: new Date().toISOString(),
    };
  });

export const saveGeneratedTemplatePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    generation: generationInputSchema,
    matter_id: z.string().uuid(),
    folder_id: z.string().uuid().nullable().optional(),
    filename: z.string().trim().min(1).max(180).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const scope = await resolveScope(context);
    if (!scope.targetFirmId) throw new Error("Aucun cabinet actif.");
    const matter = await resolveMatterAndFolder(context, data.matter_id, data.folder_id ?? null, scope.targetFirmId);
    const out = await generateDocumentBytes(context, data.generation);

    const docId = crypto.randomUUID();
    const baseName = toSafePdfName(data.filename || `${out.templateName}-${matter.number || matter.title || "dossier"}`);
    const filename = `${baseName}.pdf`;
    const storagePath = `matters/${matter.id}/${docId}-${filename}`;

    const { error: upErr } = await context.supabase.storage
      .from("bar-media")
      .upload(storagePath, out.bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`Archivage impossible : ${upErr.message}`);

    const { error: docErr } = await context.supabase
      .from("matter_documents")
      .insert({
        id: docId,
        matter_id: matter.id,
        folder_id: data.folder_id ?? null,
        filename,
        storage_path: storagePath,
        mime_type: "application/pdf",
        size_bytes: out.bytes.length,
        uploaded_by: context.userId,
      });
    if (docErr) throw new Error(docErr.message);

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase,
      context.userId,
      matter.id,
      data.generation.signature ? "document_signed" : "document_generated",
      data.generation.signature
        ? `Document signé « ${filename} » généré depuis le modèle ${out.templateName}`
        : `Document « ${filename} » généré depuis le modèle ${out.templateName}`,
      {
        entity_type: "document",
        entity_id: docId,
        metadata: {
          template_id: out.templateId,
          template_version: out.version,
          signature: Boolean(data.generation.signature),
        },
      },
    );

    return {
      ok: true,
      document_id: docId,
      filename,
      storage_path: storagePath,
      size_bytes: out.bytes.length,
    };
  });
