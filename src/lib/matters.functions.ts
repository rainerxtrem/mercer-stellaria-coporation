import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logMatterActivity, withActorNames } from "@/lib/activity-log";
import { z } from "zod";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
]);
const MAX_SIZE = 25 * 1024 * 1024;

async function logActivity(
  context: { supabase: any; userId: string },
  matter_id: string,
  action: string,
  summary: string,
  entity?: { entity_type?: string; entity_id?: string; metadata?: Record<string, unknown> },
) {
  await logMatterActivity(context.supabase, context.userId, matter_id, action, summary, entity);
}

async function requireActiveFirmId(context: { supabase: any; userId: string; claims?: Record<string, unknown> }) {
  const fromClaims = (context.claims?.firm_id as string | undefined) ?? null;
  if (fromClaims) return fromClaims;
  const { data: profile } = await context.supabase
    .from("profiles")
    .select("active_firm_id")
    .eq("id", context.userId)
    .maybeSingle();
  const firmId = (profile?.active_firm_id as string | null) ?? null;
  if (!firmId) throw new Error("Aucune entreprise active sélectionnée.");
  return firmId;
}


// ============ MATTERS ============
const matterSchema = z.object({
  title: z.string().trim().min(2).max(200),
  client_id: z.string().uuid().nullable().optional(),
  type: z.string().trim().max(80).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(["open", "pending", "instance", "closed", "archived"]).default("open"),
  opened_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const listMatters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { search?: string; status?: string; client_id?: string } = {}) => ({
    search: typeof d.search === "string" ? d.search.slice(0, 100) : undefined,
    status: typeof d.status === "string" ? d.status.slice(0, 40) : undefined,
    client_id: typeof d.client_id === "string" ? d.client_id : undefined,
  }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    let q = context.supabase
      .from("matters")
      .select("*, clients!matters_client_id_fkey(id,first_name,last_name)")
      .eq("firm_id", firmId)
      .order("opened_on", { ascending: false });
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.client_id && /^[0-9a-f-]{36}$/i.test(data.client_id)) q = q.eq("client_id", data.client_id);
    if (data.search) {
      // Strict allowlist sanitizing to prevent PostgREST .or() filter injection
      const { sanitizeSearchTerm } = await import("@/lib/search-filter");
      const safe = sanitizeSearchTerm(data.search);
      if (safe) q = q.or(`title.ilike.%${safe}%,number.ilike.%${safe}%`);
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return withActorNames(context.supabase, rows ?? [], {
      owner_id: "owner_name",
      updated_by: "updated_by_name",
    });
  });

export const getMatter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { data: m, error } = await context.supabase
      .from("matters")
      .select("*, clients!matters_client_id_fkey(id,first_name,last_name,email,phone)")
      .eq("id", data.id)
      .eq("firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) throw new Error("Dossier introuvable");
    const [withNames] = await withActorNames(context.supabase, [m], {
      owner_id: "owner_name",
      updated_by: "updated_by_name",
    });
    return withNames;
  });


export const createMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof matterSchema>) => matterSchema.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { data: created, error } = await context.supabase
      .from("matters")
      .insert({ ...data, owner_id: context.userId, number: "", firm_id: firmId } as any)
      .select("id, number, title")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context, created.id, "create", `Dossier ${created.number} créé`);
    return created;
  });

const STATUS_LABELS: Record<string, string> = {
  open: "En cours",
  pending: "En attente",
  instance: "En instance",
  closed: "Clôturé",
  archived: "Archivé",
};

export const updateMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & Partial<z.infer<typeof matterSchema>>) => {
    const id = z.string().uuid().parse(d.id);
    const { id: _i, ...rest } = d;
    return { id, ...matterSchema.partial().parse(rest) };
  })
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { id, ...updates } = data;
    const { data: before } = await context.supabase
      .from("matters")
      .select("title, status")
      .eq("id", id)
      .eq("firm_id", firmId)
      .maybeSingle();
    const { error } = await context.supabase.from("matters").update(updates).eq("id", id).eq("firm_id", firmId);
    if (error) throw new Error(error.message);

    const statusChanged =
      updates.status !== undefined && before && updates.status !== before.status;
    const titleChanged =
      updates.title !== undefined && before && updates.title !== before.title;

    if (statusChanged) {
      const from = STATUS_LABELS[before!.status] ?? before!.status;
      const to = STATUS_LABELS[updates.status as string] ?? updates.status;
      await logActivity(
        context,
        id,
        updates.status === "closed" ? "status_closed" : "status_change",
        updates.status === "closed"
          ? `Dossier clôturé (précédemment « ${from} »)`
          : `Statut modifié de « ${from} » vers « ${to} »`,
        { metadata: { field: "status", from: before!.status, to: updates.status, from_label: from, to_label: to } },
      );
    }
    if (titleChanged) {
      await logActivity(context, id, "rename", `Dossier renommé de « ${before!.title} » vers « ${updates.title} »`, {
        metadata: { field: "title", from: before!.title, to: updates.title },
      });
    }
    const otherKeys = Object.keys(updates).filter((k) => k !== "status" && k !== "title");
    if (otherKeys.length > 0 || (!statusChanged && !titleChanged && Object.keys(updates).length > 0)) {
      if (otherKeys.length > 0) {
        await logActivity(context, id, "update", "Dossier modifié", {
          metadata: Object.fromEntries(otherKeys.map((k) => [k, (updates as any)[k]])),
        });
      }
    }
    return { id };
  });


export const deleteMatter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    // Purge storage for this matter (cascade will clean db)
    const { data: docs } = await context.supabase
      .from("matter_documents")
      .select("storage_path")
      .eq("matter_id", data.id);
    if (docs && docs.length > 0) {
      await context.supabase.storage.from("bar-media").remove(docs.map((d: any) => d.storage_path));
    }
    const { error } = await context.supabase.from("matters").delete().eq("id", data.id).eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ FOLDERS ============
export const listMatterTree = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string }) => ({ matter_id: z.string().uuid().parse(d.matter_id) }))
  .handler(async ({ data, context }) => {
    const [{ data: folders }, { data: documents }] = await Promise.all([
      context.supabase.from("matter_folders").select("*").eq("matter_id", data.matter_id).order("name"),
      context.supabase.from("matter_documents").select("*").eq("matter_id", data.matter_id).order("filename"),
    ]);
    return { folders: folders ?? [], documents: documents ?? [] };
  });

export const createFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string; parent_id: string | null; name: string }) => ({
    matter_id: z.string().uuid().parse(d.matter_id),
    parent_id: d.parent_id ? z.string().uuid().parse(d.parent_id) : null,
    name: z.string().trim().min(1).max(120).parse(d.name),
  }))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("matter_folders")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context, data.matter_id, "folder_create", `Sous-dossier « ${data.name} » créé`, {
      entity_type: "folder",
      entity_id: created.id,
    });
    return created;
  });

export const renameFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; name: string }) => ({
    id: z.string().uuid().parse(d.id),
    name: z.string().trim().min(1).max(120).parse(d.name),
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("matter_folders")
      .update({ name: data.name })
      .eq("id", data.id)
      .select("matter_id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context, row.matter_id, "folder_rename", `Dossier renommé en « ${data.name} »`, {
      entity_type: "folder",
      entity_id: data.id,
    });
    return { ok: true };
  });

export const deleteFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    // Collect all descendant folder ids
    const { data: allFolders } = await context.supabase
      .from("matter_folders")
      .select("id, parent_id, matter_id")
      .eq("matter_id",
        (await context.supabase.from("matter_folders").select("matter_id").eq("id", data.id).single()).data?.matter_id ?? "00000000-0000-0000-0000-000000000000",
      );
    const ids = new Set<string>([data.id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of allFolders ?? []) {
        if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
          ids.add(f.id);
          changed = true;
        }
      }
    }
    // Purge storage for docs in these folders
    const { data: docs } = await context.supabase
      .from("matter_documents")
      .select("storage_path")
      .in("folder_id", Array.from(ids));
    if (docs && docs.length > 0) {
      await context.supabase.storage.from("bar-media").remove(docs.map((d: any) => d.storage_path));
    }
    const { data: row, error } = await context.supabase
      .from("matter_folders")
      .delete()
      .eq("id", data.id)
      .select("matter_id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context, row.matter_id, "folder_delete", "Sous-dossier supprimé");
    return { ok: true };
  });

// ============ DOCUMENTS ============
export const createSignedUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string; folder_id: string | null; filename: string; mime_type: string; size_bytes: number }) => ({
    matter_id: z.string().uuid().parse(d.matter_id),
    folder_id: d.folder_id ? z.string().uuid().parse(d.folder_id) : null,
    filename: z.string().trim().min(1).max(255).parse(d.filename),
    mime_type: z.string().parse(d.mime_type),
    size_bytes: z.number().int().nonnegative().parse(d.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    if (data.size_bytes > MAX_SIZE) throw new Error("Fichier trop volumineux (max 25 Mo).");
    if (!ALLOWED_MIME.has(data.mime_type)) throw new Error(`Type de fichier non autorisé (${data.mime_type}).`);
    const docId = crypto.randomUUID();
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `matters/${data.matter_id}/${docId}-${safeName}`;
    const { data: signed, error } = await context.supabase.storage
      .from("bar-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { doc_id: docId, path, token: signed.token, signed_url: signed.signedUrl };
  });

export const finalizeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    doc_id: string;
    matter_id: string;
    folder_id: string | null;
    filename: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
  }) => ({
    doc_id: z.string().uuid().parse(d.doc_id),
    matter_id: z.string().uuid().parse(d.matter_id),
    folder_id: d.folder_id ? z.string().uuid().parse(d.folder_id) : null,
    filename: z.string().trim().min(1).max(255).parse(d.filename),
    storage_path: z.string().parse(d.storage_path),
    mime_type: z.string().parse(d.mime_type),
    size_bytes: z.number().int().nonnegative().parse(d.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("matter_documents").insert({
      id: data.doc_id,
      matter_id: data.matter_id,
      folder_id: data.folder_id,
      filename: data.filename,
      storage_path: data.storage_path,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      uploaded_by: context.userId,
    });
    if (error) throw new Error(error.message);
    await logActivity(context, data.matter_id, "doc_upload", `Fichier « ${data.filename} » importé`, {
      entity_type: "document",
      entity_id: data.doc_id,
    });
    return { ok: true };
  });

export const renameDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; filename: string }) => ({
    id: z.string().uuid().parse(d.id),
    filename: z.string().trim().min(1).max(255).parse(d.filename),
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("matter_documents")
      .update({ filename: data.filename })
      .eq("id", data.id)
      .select("matter_id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context, row.matter_id, "doc_rename", `Fichier renommé en « ${data.filename} »`, {
      entity_type: "document",
      entity_id: data.id,
    });
    return { ok: true };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const { data: row, error: gErr } = await context.supabase
      .from("matter_documents")
      .select("matter_id, storage_path, filename")
      .eq("id", data.id)
      .single();
    if (gErr) throw new Error(gErr.message);
    await context.supabase.storage.from("bar-media").remove([row.storage_path]);
    const { error } = await context.supabase.from("matter_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(context, row.matter_id, "doc_delete", `Fichier « ${row.filename} » supprimé`);
    return { ok: true };
  });

export const getDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const { data: row, error: gErr } = await context.supabase
      .from("matter_documents")
      .select("storage_path, filename, matter_id")
      .eq("id", data.id)
      .single();
    if (gErr) throw new Error(gErr.message);
    const { data: signed, error } = await context.supabase.storage
      .from("bar-media")
      .createSignedUrl(row.storage_path, 300, { download: row.filename });
    if (error) throw new Error(error.message);
    await logActivity(context, row.matter_id, "doc_download", `Téléchargement de « ${row.filename} »`, {
      entity_type: "document",
      entity_id: data.id,
    });
    return { url: signed.signedUrl };
  });

export const listMatterActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { matter_id: string }) => ({ matter_id: z.string().uuid().parse(d.matter_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("matter_activity")
      .select("*")
      .eq("matter_id", data.matter_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return withActorNames(context.supabase, rows ?? [], { actor_id: "actor_name" });

  });
