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
