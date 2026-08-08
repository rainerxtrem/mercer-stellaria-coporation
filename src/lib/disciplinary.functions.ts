import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertBatonnier(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "batonnier" });
  if (!data) throw new Error("Accès réservé à la direction.");
}

// ---------- Public: file a complaint ----------
const ComplaintSchema = z.object({
  complainant_name: z.string().min(2).max(120),
  complainant_email: z.string().email(),
  complainant_phone: z.string().max(40).optional(),
  lawyer_id: z.string().uuid().optional().nullable(),
  lawyer_name_input: z.string().max(160).optional(),
  subject: z.string().min(3).max(180),
  description: z.string().min(10).max(4000),
});

export const submitComplaint = createServerFn({ method: "POST" })
  .inputValidator((d) => ComplaintSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabasePublic: supa } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supa.from("disciplinary_complaints").insert({
      complainant_name: data.complainant_name,
      complainant_email: data.complainant_email,
      complainant_phone: data.complainant_phone ?? null,
      lawyer_id: data.lawyer_id ?? null,
      lawyer_name_input: data.lawyer_name_input ?? null,
      subject: data.subject,
      description: data.description,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return row;
  });

// ---------- Admin: complaints ----------
export const listComplaints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { data, error } = await context.supabase
      .from("disciplinary_complaints").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateComplaint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    status: z.enum(["new", "under_review", "dismissed", "referred"]).optional(),
    admin_notes: z.string().max(4000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const patch: any = { handled_by: context.userId, handled_at: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;
    const { error } = await context.supabase.from("disciplinary_complaints").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Admin: cases ----------
export const listCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { data, error } = await context.supabase
      .from("disciplinary_cases")
      .select("*, lawyer:lawyers(id, first_name, last_name, license)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    lawyer_id: z.string().uuid(),
    title: z.string().min(3).max(200),
    summary: z.string().max(2000).optional(),
    complaint_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { data: row, error } = await context.supabase.from("disciplinary_cases").insert({
      lawyer_id: data.lawyer_id, title: data.title, summary: data.summary ?? null,
      complaint_id: data.complaint_id ?? null, created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error(error.message);
    if (data.complaint_id) {
      await context.supabase.from("disciplinary_complaints").update({ status: "referred", handled_by: context.userId, handled_at: new Date().toISOString() }).eq("id", data.complaint_id);
    }
    return row;
  });

export const getCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const [caseRes, hearRes, decRes] = await Promise.all([
      context.supabase.from("disciplinary_cases").select("*, lawyer:lawyers(id, first_name, last_name, license, email)").eq("id", data.id).single(),
      context.supabase.from("disciplinary_hearings").select("*").eq("case_id", data.id).order("scheduled_at", { ascending: true }),
      context.supabase.from("disciplinary_decisions").select("*").eq("case_id", data.id).order("decided_at", { ascending: false }),
    ]);
    if (caseRes.error) throw new Error(caseRes.error.message);
    return { case: caseRes.data, hearings: hearRes.data ?? [], decisions: decRes.data ?? [] };
  });

export const updateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    title: z.string().min(3).max(200).optional(),
    summary: z.string().max(2000).optional(),
    status: z.enum(["opened", "investigation", "hearing", "decided", "closed"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("disciplinary_cases").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Hearings ----------
export const addHearing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    case_id: z.string().uuid(),
    scheduled_at: z.string(),
    location: z.string().max(200).optional(),
    notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("disciplinary_hearings").insert({
      case_id: data.case_id, scheduled_at: data.scheduled_at,
      location: data.location ?? null, notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    await context.supabase.from("disciplinary_cases").update({ status: "hearing" }).eq("id", data.case_id);
    return { ok: true };
  });

export const updateHearing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    id: z.string().uuid(),
    held: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("disciplinary_hearings").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Decisions ----------
export const addDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    case_id: z.string().uuid(),
    decision: z.enum(["dismissal", "warning", "reprimand", "suspension", "disbarment"]),
    motivation: z.string().min(10).max(4000),
    sanction_start: z.string().optional(),
    sanction_end: z.string().optional(),
    published: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("disciplinary_decisions").insert({
      case_id: data.case_id, decision: data.decision, motivation: data.motivation,
      sanction_start: data.sanction_start || null, sanction_end: data.sanction_end || null,
      published: data.published, decided_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const togglePublishDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), published: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("disciplinary_decisions").update({ published: data.published }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Lawyer view: my cases ----------
export const myDisciplinaryCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: lawyer } = await context.supabase.from("lawyers").select("id").eq("profile_id", context.userId).maybeSingle();
    if (!lawyer) return [];
    const { data, error } = await context.supabase.from("disciplinary_cases")
      .select("*, decisions:disciplinary_decisions(*), hearings:disciplinary_hearings(*)")
      .eq("lawyer_id", lawyer.id).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Public: published decisions ----------
export const listPublicDecisions = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_public_disciplinary_decisions");
  if (error) throw new Error(error.message);
  return data ?? [];
});

