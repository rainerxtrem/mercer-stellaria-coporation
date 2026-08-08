import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertBatonnier(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "batonnier" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Accès réservé à la direction.");
}

const ListSchema = z.object({
  entity_type: z.string().optional(),
  action: z.string().optional(),
  actor_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  page_size: z.number().int().min(1).max(200).default(50),
});

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    let q = context.supabase.from("audit_log").select("*", { count: "exact" });
    if (data.entity_type) q = q.eq("entity_type", data.entity_type);
    if (data.action) q = q.eq("action", data.action);
    if (data.actor_id) q = q.eq("actor_id", data.actor_id);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.search) q = q.ilike("summary", `%${data.search.replace(/[%_]/g, "")}%`);
    const from = (data.page - 1) * data.page_size;
    const to = from + data.page_size - 1;
    const { data: rows, count, error } = await q.order("created_at", { ascending: false }).range(from, to);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

export const exportAuditCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ListSchema.omit({ page: true, page_size: true }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    let q = context.supabase.from("audit_log").select("*");
    if (data.entity_type) q = q.eq("entity_type", data.entity_type);
    if (data.action) q = q.eq("action", data.action);
    if (data.actor_id) q = q.eq("actor_id", data.actor_id);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.search) q = q.ilike("summary", `%${data.search.replace(/[%_]/g, "")}%`);
    const { data: rows, error } = await q.order("created_at", { ascending: false }).limit(10000);
    if (error) throw new Error(error.message);
    const esc = (v: any) => {
      if (v == null) return "";
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ["created_at", "actor_id", "entity_type", "entity_id", "action", "summary"].join(",");
    const body = (rows ?? []).map((r: any) =>
      [r.created_at, r.actor_id, r.entity_type, r.entity_id, r.action, r.summary].map(esc).join(",")
    ).join("\n");
    return { csv: header + "\n" + body, count: rows?.length ?? 0 };
  });

export const listAuditEntities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { data, error } = await context.supabase.from("audit_log").select("entity_type").limit(5000);
    if (error) throw new Error(error.message);
    const set = new Set<string>();
    (data ?? []).forEach((r: any) => set.add(r.entity_type));
    return Array.from(set).sort();
  });

// ============ BACKUPS ============

const BACKUP_TABLES = [
  "firms", "lawyers", "profiles", "user_roles",
  "clients", "matters", "matter_folders", "matter_documents", "matter_tasks", "matter_assistants", "matter_activity",
  "invoices", "invoice_items", "invoice_payments",
  "news", "library_categories", "library_articles", "site_content",
  "bar_exams", "bar_exam_questions", "bar_exam_choices", "bar_exam_attempts", "bar_exam_answers",
  "trainings", "training_modules", "training_questions", "training_choices", "training_attempts",
  "notifications", "contact_requests", "audit_log",
] as const;

export const listBackups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { data, error } = await context.supabase.from("backups").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ note: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const dump: Record<string, any[]> = {};
    const counts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      const { data: rows, error } = await supabaseAdmin.from(t).select("*");
      if (error) throw new Error(`Table ${t}: ${error.message}`);
      dump[t] = rows ?? [];
      counts[t] = rows?.length ?? 0;
    }

    const payload = {
      generated_at: new Date().toISOString(),
      generated_by: context.userId,
      version: 1,
      tables: dump,
    };
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup-${stamp}.json`;
    const storagePath = `backups/${filename}`;

    const { error: upErr } = await supabaseAdmin.storage
      .from("bar-media")
      .upload(storagePath, bytes, { contentType: "application/json", upsert: false });
    if (upErr) throw new Error(upErr.message);

    const { data: row, error: insErr } = await supabaseAdmin.from("backups").insert({
      created_by: context.userId,
      filename,
      storage_path: storagePath,
      size_bytes: bytes.byteLength,
      tables: BACKUP_TABLES as unknown as string[],
      row_counts: counts,
      note: data.note ?? null,
    }).select("*").single();
    if (insErr) throw new Error(insErr.message);
    return row;
  });

export const getBackupDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: b, error } = await supabaseAdmin.from("backups").select("storage_path").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from("bar-media")
      .createSignedUrl(b.storage_path, 300);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl };
  });

export const deleteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: b, error } = await supabaseAdmin.from("backups").select("storage_path").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.storage.from("bar-media").remove([b.storage_path]);
    const { error: dErr } = await supabaseAdmin.from("backups").delete().eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    return { ok: true };
  });
