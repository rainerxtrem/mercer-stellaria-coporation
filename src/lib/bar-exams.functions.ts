// Server functions — CEO's control over the Bar Exam module.
// Uses `supabaseAdmin` inside handlers only, to keep the client bundle clean.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertBatonnier(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  if (error) throw new Error(error.message);
  if (!(data ?? []).some((r: any) => r.role === "batonnier")) {
    throw new Error("Accès refusé — rôla direction requis.");
  }
}

async function audit(ctx: any, examId: string | null, attemptId: string | null, action: string, payload?: any) {
  await ctx.supabase.from("bar_exam_audit").insert({
    exam_id: examId, attempt_id: attemptId, actor_id: ctx.userId, action, payload: payload ?? null,
  });
}

// ============ EXAMS ============
const examSchema = z.object({
  name: z.string().min(2).max(200),
  description: z.string().max(4000).nullable().optional(),
  duration_min: z.number().int().min(1).max(24 * 60),
  opens_at: z.string().nullable().optional(),
  closes_at: z.string().nullable().optional(),
  pass_threshold_pct: z.number().int().min(0).max(100),
  max_attempts: z.number().int().min(1).max(20),
  show_results_to_candidate: z.boolean(),
  auto_publish_results: z.boolean(),
  shuffle_questions: z.boolean(),
  shuffle_answers: z.boolean(),
});

export const listExams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { data, error } = await context.supabase.from("bar_exams").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getExam = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { data: exam, error } = await context.supabase.from("bar_exams").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    const { data: questions } = await context.supabase
      .from("bar_exam_questions").select("*").eq("exam_id", data.id).order("position");
    const qIds = (questions ?? []).map((q: any) => q.id);
    const { data: choices } = qIds.length
      ? await context.supabase.from("bar_exam_choices").select("*").in("question_id", qIds).order("position")
      : { data: [] as any[] };
    return { exam, questions: questions ?? [], choices: choices ?? [] };
  });

export const upsertExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string } & z.infer<typeof examSchema>) => {
    const { id, ...rest } = d;
    return { id, ...examSchema.parse(rest) };
  })
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    if (data.id) {
      const { id, ...updates } = data;
      const { error } = await context.supabase.from("bar_exams").update(updates).eq("id", id);
      if (error) throw new Error(error.message);
      await audit(context, id, null, "exam.update", { name: updates.name });
      return { id };
    }
    const { id: _i, ...ins } = data;
    const { data: created, error } = await context.supabase
      .from("bar_exams").insert({ ...ins, created_by: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    await audit(context, created.id, null, "exam.create", { name: ins.name });
    return { id: created.id };
  });

export const setExamStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "draft" | "open" | "closed" | "archived" }) => d)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("bar_exams")
      .update({ status: data.status, access_code_active: data.status === "open" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    // Invalider les tentatives en cours si l'examen est fermé/archivé
    if (data.status === "closed" || data.status === "archived") {
      await context.supabase.from("bar_exam_attempts")
        .update({ status: "submitted", submitted_at: new Date().toISOString(), auto_submitted: true })
        .eq("exam_id", data.id).eq("status", "in_progress");
    }
    await audit(context, data.id, null, `exam.${data.status}`);
    return { ok: true };
  });

export const deleteExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("bar_exams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, null, null, "exam.delete", { id: data.id });
    return { ok: true };
  });

export const regenerateAccessCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const code = Array.from({ length: 8 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
    const { error } = await context.supabase.from("bar_exams")
      .update({ access_code: code, access_code_active: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await audit(context, data.id, null, "exam.regenerate_code");
    return { code };
  });

// ============ QUESTIONS ============
const questionSchema = z.object({
  exam_id: z.string().uuid(),
  prompt: z.string().min(1).max(4000),
  type: z.enum(["single", "multiple", "truefalse", "short", "essay"]),
  points: z.number().min(0).max(1000),
  explanation: z.string().max(4000).nullable().optional(),
  category: z.string().max(120).nullable().optional(),
  position: z.number().int().min(0).max(10000).optional(),
});

async function recomputeTotal(ctx: any, examId: string) {
  const { data } = await ctx.supabase.from("bar_exam_questions").select("points").eq("exam_id", examId);
  const total = (data ?? []).reduce((s: number, q: any) => s + Number(q.points || 0), 0);
  await ctx.supabase.from("bar_exams").update({ total_points: total }).eq("id", examId);
}

export const upsertQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string } & z.infer<typeof questionSchema>) => {
    const { id, ...rest } = d;
    return { id, ...questionSchema.parse(rest) };
  })
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    let qid = data.id;
    if (qid) {
      const { id: _drop, ...upd } = data;
      const { error } = await context.supabase.from("bar_exam_questions").update(upd).eq("id", qid);
      if (error) throw new Error(error.message);
    } else {
      const { id: _i, position, ...ins } = data;
      const { count } = await context.supabase.from("bar_exam_questions")
        .select("id", { count: "exact", head: true }).eq("exam_id", ins.exam_id);
      const { data: created, error } = await context.supabase.from("bar_exam_questions")
        .insert({ ...ins, position: position ?? (count ?? 0) }).select("id").single();
      if (error) throw new Error(error.message);
      qid = created.id;
    }
    await recomputeTotal(context, data.exam_id);
    return { id: qid };
  });

export const deleteQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { data: q } = await context.supabase.from("bar_exam_questions").select("exam_id").eq("id", data.id).maybeSingle();
    const { error } = await context.supabase.from("bar_exam_questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    if (q?.exam_id) await recomputeTotal(context, q.exam_id);
    return { ok: true };
  });

export const duplicateQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { data: q } = await context.supabase.from("bar_exam_questions").select("*").eq("id", data.id).maybeSingle();
    if (!q) throw new Error("Question introuvable");
    const { count } = await context.supabase.from("bar_exam_questions")
      .select("id", { count: "exact", head: true }).eq("exam_id", q.exam_id);
    const { id: _drop, created_at: _c, updated_at: _u, ...clone } = q;
    const { data: created, error: cErr } = await context.supabase.from("bar_exam_questions")
      .insert({ ...clone, prompt: q.prompt + " (copie)", position: count ?? 0 }).select("id").single();
    if (cErr || !created) throw new Error(cErr?.message || "Duplication échouée");
    const { data: choices } = await context.supabase.from("bar_exam_choices").select("*").eq("question_id", q.id);
    if (choices?.length) {
      const clones = choices.map((c: any) => {
        const { id, created_at, ...rest } = c;
        return { ...rest, question_id: created.id };
      });
      await context.supabase.from("bar_exam_choices").insert(clones);
    }
    await recomputeTotal(context, q.exam_id);
    return { id: created.id };
  });

// ============ CHOICES ============
const choiceSchema = z.object({
  question_id: z.string().uuid(),
  label: z.string().min(1).max(2000),
  is_correct: z.boolean(),
  points_override: z.number().nullable().optional(),
  position: z.number().int().min(0).max(10000).optional(),
});

export const upsertChoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string } & z.infer<typeof choiceSchema>) => {
    const { id, ...rest } = d;
    return { id, ...choiceSchema.parse(rest) };
  })
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    if (data.id) {
      const { id, ...upd } = data;
      const { error } = await context.supabase.from("bar_exam_choices").update(upd).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { id: _i, position, ...ins } = data;
    const { count } = await context.supabase.from("bar_exam_choices")
      .select("id", { count: "exact", head: true }).eq("question_id", ins.question_id);
    const { data: created, error } = await context.supabase.from("bar_exam_choices")
      .insert({ ...ins, position: position ?? (count ?? 0) }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteChoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("bar_exam_choices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ ATTEMPTS (CEO side) ============
export const listAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId: string }) => ({ examId: z.string().uuid().parse(d.examId) }))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempts, error } = await supabaseAdmin
      .from("bar_exam_attempts").select("*")
      .eq("exam_id", data.examId).order("started_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Enrich with candidate info
    const userIds = Array.from(new Set((attempts ?? []).map((a: any) => a.candidate_id)));
    const profileMap: Record<string, any> = {};
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", userIds);
      (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });
      const { data: lawyers } = await supabaseAdmin.from("lawyers").select("profile_id, license, firm_id, firms(name)").in("profile_id", userIds);
      (lawyers ?? []).forEach((l: any) => { profileMap[l.profile_id] = { ...(profileMap[l.profile_id] || {}), license: l.license, firm: l.firms?.name }; });
    }
    return (attempts ?? []).map((a: any) => ({ ...a, candidate: profileMap[a.candidate_id] || {} }));
  });

export const getAttemptForGrading = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string }) => ({ attemptId: z.string().uuid().parse(d.attemptId) }))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin.from("bar_exam_attempts").select("*").eq("id", data.attemptId).maybeSingle();
    if (!attempt) throw new Error("Tentative introuvable");
    const { data: exam } = await supabaseAdmin.from("bar_exams").select("*").eq("id", attempt.exam_id).maybeSingle();
    const { data: questions } = await supabaseAdmin.from("bar_exam_questions").select("*").eq("exam_id", attempt.exam_id).order("position");
    const qIds = (questions ?? []).map((q: any) => q.id);
    const { data: choices } = qIds.length ? await supabaseAdmin.from("bar_exam_choices").select("*").in("question_id", qIds).order("position") : { data: [] as any[] };
    const { data: answers } = await supabaseAdmin.from("bar_exam_answers").select("*").eq("attempt_id", data.attemptId);
    const { data: profile } = await supabaseAdmin.from("profiles").select("id, full_name").eq("id", attempt.candidate_id).maybeSingle();
    const { data: lawyer } = await supabaseAdmin.from("lawyers").select("license, firm_id, firms(name)").eq("profile_id", attempt.candidate_id).maybeSingle();
    return { attempt, exam, questions: questions ?? [], choices: choices ?? [], answers: answers ?? [], candidate: { ...profile, license: lawyer?.license, firm: (lawyer as any)?.firms?.name } };
  });

export const gradeManualAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { answerId: string; points: number; correct: boolean }) => ({
    answerId: z.string().uuid().parse(d.answerId),
    points: z.number().min(0).max(1000).parse(d.points),
    correct: z.boolean().parse(d.correct),
  }))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("bar_exam_answers")
      .update({ awarded_points: data.points, is_correct: data.correct, manually_graded: true })
      .eq("id", data.answerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const finalizeGrading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string; comment?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: answers } = await supabaseAdmin.from("bar_exam_answers").select("awarded_points, is_correct").eq("attempt_id", data.attemptId);
    const { data: attempt } = await supabaseAdmin.from("bar_exam_attempts").select("exam_id, total_points").eq("id", data.attemptId).maybeSingle();
    const { data: exam } = attempt ? await supabaseAdmin.from("bar_exams").select("pass_threshold_pct, total_points").eq("id", attempt.exam_id).maybeSingle() : { data: null };
    const totalPoints = Number(attempt?.total_points ?? exam?.total_points ?? 0);
    const scored = (answers ?? []).reduce((s: number, a: any) => s + Number(a.awarded_points ?? 0), 0);
    const correct = (answers ?? []).filter((a: any) => a.is_correct === true).length;
    const wrong = (answers ?? []).filter((a: any) => a.is_correct === false).length;
    const pct = totalPoints > 0 ? (scored / totalPoints) * 100 : 0;
    const passed = pct >= Number(exam?.pass_threshold_pct ?? 60);
    const { error } = await supabaseAdmin.from("bar_exam_attempts").update({
      score_points: scored, score_pct: pct, passed, correct_count: correct, wrong_count: wrong,
      status: "graded", batonnier_comment: data.comment ?? null,
      graded_by: context.userId, graded_at: new Date().toISOString(), needs_manual_grading: false,
    }).eq("id", data.attemptId);
    if (error) throw new Error(error.message);
    await audit(context, attempt?.exam_id ?? null, data.attemptId, "attempt.grade", { pct, passed });
    return { ok: true, passed, pct };
  });

// ============ ADMISSION AU BARREAU ============
export const admitToBar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    attemptId: string; firm_id?: string | null; first_name: string; last_name: string;
    specialty?: string | null; city?: string | null; email?: string | null; phone?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin.from("bar_exam_attempts").select("*").eq("id", data.attemptId).maybeSingle();
    if (!attempt) throw new Error("Tentative introuvable");
    if (!attempt.passed) throw new Error("Le candidat n'a pas réussi l'examen.");
    // Generate license
    const { data: licenseData } = await supabaseAdmin.rpc("next_bar_license" as any);
    const license = licenseData as unknown as string;
    // Create/update lawyer record
    const { data: existing } = await supabaseAdmin.from("lawyers").select("id").eq("profile_id", attempt.candidate_id).maybeSingle();
    let lawyerId: string;
    if (existing) {
      lawyerId = existing.id;
      await supabaseAdmin.from("lawyers").update({
        license, status: "active", admitted_on: new Date().toISOString().slice(0, 10),
        firm_id: data.firm_id ?? null, first_name: data.first_name, last_name: data.last_name,
        specialty: data.specialty ?? null, city: data.city ?? null, email: data.email ?? null, phone: data.phone ?? null,
      }).eq("id", existing.id);
    } else {
      const { data: created, error } = await supabaseAdmin.from("lawyers").insert({
        profile_id: attempt.candidate_id, license, status: "active",
        admitted_on: new Date().toISOString().slice(0, 10),
        first_name: data.first_name, last_name: data.last_name,
        specialty: data.specialty ?? null, city: data.city ?? null,
        firm_id: data.firm_id ?? null, email: data.email ?? null, phone: data.phone ?? null,
      }).select("id").single();
      if (error) throw new Error(error.message);
      lawyerId = created.id;
    }
    // Grant avocat role
    await supabaseAdmin.from("user_roles").insert({ user_id: attempt.candidate_id, role: "avocat" as any })
      .then(() => {}, () => {}); // ignore duplicates
    // Mark attempt admitted
    await supabaseAdmin.from("bar_exam_attempts").update({ status: "admitted" }).eq("id", data.attemptId);
    await audit(context, attempt.exam_id, data.attemptId, "candidate.admitted", { license, lawyerId });
    return { ok: true, license, lawyerId };
  });

// ============ LIST OPEN EXAMS (candidate side) ============
export const listOpenExams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context: _c }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("bar_exams")
      .select("id, name, description, duration_min, opens_at, closes_at, pass_threshold_pct, total_points, max_attempts, show_results_to_candidate")
      .eq("status", "open")
      .or(`opens_at.is.null,opens_at.lte.${nowIso}`)
      .or(`closes_at.is.null,closes_at.gte.${nowIso}`)
      .order("opens_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
