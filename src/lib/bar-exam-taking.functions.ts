// Candidate side — start / read / save / submit an exam attempt.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function shuffled<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function audit(ctx: any, examId: string | null, attemptId: string | null, action: string, payload?: any) {
  await ctx.supabase.from("bar_exam_audit").insert({
    exam_id: examId, attempt_id: attemptId, actor_id: ctx.userId, action, payload: payload ?? null,
  });
}

export const startExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { examId: string; accessCode: string }) => ({
    examId: z.string().uuid().parse(d.examId),
    accessCode: z.string().min(1).max(64).parse(d.accessCode.trim().toUpperCase()),
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: exam } = await supabaseAdmin.from("bar_exams").select("*").eq("id", data.examId).maybeSingle();
    if (!exam) throw new Error("Examen introuvable.");
    if (exam.status !== "open") throw new Error("Cet examen n'est pas ouvert.");
    if (!exam.access_code_active || exam.access_code !== data.accessCode) throw new Error("Code d'accès invalide.");
    const now = new Date();
    if (exam.opens_at && new Date(exam.opens_at) > now) throw new Error("L'examen n'est pas encore ouvert.");
    if (exam.closes_at && new Date(exam.closes_at) < now) throw new Error("L'examen est fermé.");

    // Check attempts
    const { data: prior } = await supabaseAdmin.from("bar_exam_attempts")
      .select("id, status").eq("exam_id", data.examId).eq("candidate_id", context.userId);
    const inProgress = (prior ?? []).find((a: any) => a.status === "in_progress");
    if (inProgress) return { attemptId: inProgress.id, resumed: true };
    const completed = (prior ?? []).filter((a: any) => a.status !== "in_progress").length;
    if (completed >= (exam.max_attempts ?? 1)) throw new Error("Nombre maximum de tentatives atteint.");

    const deadline = new Date(now.getTime() + exam.duration_min * 60_000).toISOString();
    const { data: attempt, error } = await supabaseAdmin.from("bar_exam_attempts").insert({
      exam_id: data.examId, candidate_id: context.userId,
      deadline_at: deadline, total_points: exam.total_points,
    }).select("id").single();
    if (error || !attempt) throw new Error(error?.message || "Impossible de démarrer.");
    await audit(context, data.examId, attempt.id, "attempt.start");
    return { attemptId: attempt.id, resumed: false };
  });

export const getMyAttempt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string }) => ({ attemptId: z.string().uuid().parse(d.attemptId) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin.from("bar_exam_attempts")
      .select("*").eq("id", data.attemptId).eq("candidate_id", context.userId).maybeSingle();
    if (!attempt) throw new Error("Tentative introuvable.");
    const { data: exam } = await supabaseAdmin.from("bar_exams")
      .select("id, name, description, duration_min, shuffle_questions, shuffle_answers, show_results_to_candidate, pass_threshold_pct, total_points")
      .eq("id", attempt.exam_id).maybeSingle();
    const { data: questions } = await supabaseAdmin.from("bar_exam_questions")
      .select("id, prompt, type, points, category, position").eq("exam_id", attempt.exam_id).order("position");
    const qIds = (questions ?? []).map((q: any) => q.id);
    // NB: never expose is_correct to the candidate.
    const { data: choices } = qIds.length
      ? await supabaseAdmin.from("bar_exam_choices").select("id, question_id, label, position").in("question_id", qIds).order("position")
      : { data: [] as any[] };
    const { data: answers } = await supabaseAdmin.from("bar_exam_answers")
      .select("question_id, choice_ids, text_answer").eq("attempt_id", data.attemptId);
    let qs = questions ?? [];
    let cs = choices ?? [];
    if (exam?.shuffle_questions) qs = shuffled(qs);
    if (exam?.shuffle_answers) cs = shuffled(cs);
    return { attempt, exam, questions: qs, choices: cs, answers: answers ?? [] };
  });

export const saveAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string; questionId: string; choiceIds?: string[]; textAnswer?: string | null }) => ({
    attemptId: z.string().uuid().parse(d.attemptId),
    questionId: z.string().uuid().parse(d.questionId),
    choiceIds: (d.choiceIds ?? []).map((s) => z.string().uuid().parse(s)),
    textAnswer: d.textAnswer ? z.string().max(20000).parse(d.textAnswer) : null,
  }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin.from("bar_exam_attempts")
      .select("id, candidate_id, status, deadline_at").eq("id", data.attemptId).maybeSingle();
    if (!attempt || attempt.candidate_id !== context.userId) throw new Error("Tentative invalide.");
    if (attempt.status !== "in_progress") throw new Error("Tentative verrouillée.");
    if (new Date(attempt.deadline_at) < new Date()) throw new Error("Temps écoulé.");
    const { error } = await supabaseAdmin.from("bar_exam_answers").upsert({
      attempt_id: data.attemptId, question_id: data.questionId,
      choice_ids: data.choiceIds, text_answer: data.textAnswer,
    }, { onConflict: "attempt_id,question_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const submitAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string; auto?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin.from("bar_exam_attempts")
      .select("*").eq("id", data.attemptId).maybeSingle();
    if (!attempt) throw new Error("Tentative introuvable.");
    // Allow batonnier or candidate
    const isOwner = attempt.candidate_id === context.userId;
    if (!isOwner) {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
      if (!(roles ?? []).some((r: any) => r.role === "batonnier")) throw new Error("Non autorisé.");
    }
    if (attempt.status !== "in_progress") return { ok: true, alreadySubmitted: true };

    const { data: exam } = await supabaseAdmin.from("bar_exams")
      .select("pass_threshold_pct, total_points, auto_publish_results").eq("id", attempt.exam_id).maybeSingle();
    const { data: questions } = await supabaseAdmin.from("bar_exam_questions")
      .select("id, type, points").eq("exam_id", attempt.exam_id);
    const qIds = (questions ?? []).map((q: any) => q.id);
    const { data: choices } = qIds.length
      ? await supabaseAdmin.from("bar_exam_choices").select("id, question_id, is_correct").in("question_id", qIds)
      : { data: [] as any[] };
    const { data: answers } = await supabaseAdmin.from("bar_exam_answers").select("*").eq("attempt_id", data.attemptId);

    let scored = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let needsManual = false;
    const answerMap = new Map((answers ?? []).map((a: any) => [a.question_id, a]));

    for (const q of (questions ?? []) as any[]) {
      const a = answerMap.get(q.id);
      const correctIds = new Set((choices ?? []).filter((c: any) => c.question_id === q.id && c.is_correct).map((c: any) => c.id));
      if (q.type === "single" || q.type === "truefalse") {
        const picked = (a?.choice_ids ?? [])[0];
        const ok = !!picked && correctIds.has(picked) && correctIds.size >= 1 && (a?.choice_ids ?? []).length === 1;
        const pts = ok ? Number(q.points) : 0;
        scored += pts;
        if (ok) correctCount++; else wrongCount++;
        await supabaseAdmin.from("bar_exam_answers").upsert({
          attempt_id: data.attemptId, question_id: q.id,
          choice_ids: a?.choice_ids ?? [], text_answer: a?.text_answer ?? null,
          awarded_points: pts, is_correct: ok, manually_graded: false,
        }, { onConflict: "attempt_id,question_id" });
      } else if (q.type === "multiple") {
        const picked = new Set(a?.choice_ids ?? []);
        const ok = picked.size === correctIds.size && [...picked].every((id) => correctIds.has(id as string)) && picked.size > 0;
        const pts = ok ? Number(q.points) : 0;
        scored += pts;
        if (ok) correctCount++; else wrongCount++;
        await supabaseAdmin.from("bar_exam_answers").upsert({
          attempt_id: data.attemptId, question_id: q.id,
          choice_ids: a?.choice_ids ?? [], text_answer: a?.text_answer ?? null,
          awarded_points: pts, is_correct: ok, manually_graded: false,
        }, { onConflict: "attempt_id,question_id" });
      } else {
        // short/essay — needs manual grading
        needsManual = true;
        await supabaseAdmin.from("bar_exam_answers").upsert({
          attempt_id: data.attemptId, question_id: q.id,
          choice_ids: a?.choice_ids ?? [], text_answer: a?.text_answer ?? null,
          awarded_points: null, is_correct: null, manually_graded: false,
        }, { onConflict: "attempt_id,question_id" });
      }
    }
    const total = Number(exam?.total_points ?? attempt.total_points ?? 0);
    const pct = total > 0 ? (scored / total) * 100 : 0;
    const passed = !needsManual ? pct >= Number(exam?.pass_threshold_pct ?? 60) : null;
    const newStatus = (!needsManual && exam?.auto_publish_results) ? "graded" : "submitted";

    await supabaseAdmin.from("bar_exam_attempts").update({
      submitted_at: new Date().toISOString(),
      auto_submitted: !!data.auto,
      status: newStatus,
      score_points: scored,
      score_pct: pct,
      correct_count: correctCount,
      wrong_count: wrongCount,
      passed,
      needs_manual_grading: needsManual,
    }).eq("id", data.attemptId);
    await audit(context, attempt.exam_id, data.attemptId, data.auto ? "attempt.auto_submit" : "attempt.submit", { pct, passed });
    return { ok: true, pct, passed, needsManual };
  });

export const getMyResult = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { attemptId: string }) => ({ attemptId: z.string().uuid().parse(d.attemptId) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt } = await supabaseAdmin.from("bar_exam_attempts")
      .select("*").eq("id", data.attemptId).eq("candidate_id", context.userId).maybeSingle();
    if (!attempt) throw new Error("Résultat introuvable.");
    const { data: exam } = await supabaseAdmin.from("bar_exams")
      .select("name, show_results_to_candidate, pass_threshold_pct").eq("id", attempt.exam_id).maybeSingle();
    return { attempt, exam };
  });

