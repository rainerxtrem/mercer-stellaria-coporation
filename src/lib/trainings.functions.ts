import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function publicClient() {
  const { supabasePublic } = await import("@/integrations/supabase/client.server");
  return supabasePublic;
}

// Liste publique des formations publiées (sans les modules ni questions).
export const listPublishedTrainings = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await publicClient();
  const { data, error } = await supabase
    .from("trainings")
    .select("id, slug, title, description, cover_url, duration_min, pass_threshold, status, category_id, training_categories(name)")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
});

// Détail d'une formation + modules + questions/choix (sans is_correct pour les non-admins).
export const getTraining = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { slug: string }) => ({ slug: z.string().min(1).parse(d.slug) }))
  .handler(async ({ data, context }) => {
    const { data: t } = await context.supabase
      .from("trainings")
      .select("id, slug, title, description, cover_url, duration_min, pass_threshold, status, training_categories(name)")
      .eq("slug", data.slug).eq("status", "published").maybeSingle();
    if (!t) return null;
    const [{ data: modules }, { data: questions }] = await Promise.all([
      context.supabase.from("training_modules").select("id, position, title, content, video_url").eq("training_id", t.id).order("position"),
      context.supabase.from("training_questions").select("id, position, prompt, kind").eq("training_id", t.id).order("position"),
    ]);
    const qIds = (questions ?? []).map((q) => q.id);
    const { data: choices } = qIds.length
      ? await context.supabase.from("training_choices").select("id, question_id, label, position").in("question_id", qIds).order("position")
      : { data: [] as any[] };
    return { training: t, modules: modules ?? [], questions: questions ?? [], choices: choices ?? [] };
  });

// Soumet une tentative : notation côté serveur, is_correct jamais exposé.
export const submitTrainingAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    training_id: z.string().uuid(),
    answers: z.array(z.object({
      question_id: z.string().uuid(),
      choice_ids: z.array(z.string().uuid()),
    })),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: training } = await context.supabase
      .from("trainings").select("id, pass_threshold").eq("id", data.training_id).maybeSingle();
    if (!training) throw new Error("Formation introuvable");

    const { data: questions } = await context.supabase
      .from("training_questions").select("id").eq("training_id", data.training_id);
    const qIds = (questions ?? []).map((q) => q.id);
    const { data: allChoices } = qIds.length
      ? await supabaseAdmin.from("training_choices").select("id, question_id, is_correct").in("question_id", qIds)
      : { data: [] as any[] };


    let score = 0;
    let max = 0;
    for (const q of questions ?? []) {
      max += 1;
      const correctIds = new Set((allChoices ?? []).filter((c: any) => c.question_id === q.id && c.is_correct).map((c: any) => c.id));
      const submitted = new Set(data.answers.find((a) => a.question_id === q.id)?.choice_ids ?? []);
      const ok = correctIds.size === submitted.size && [...correctIds].every((id) => submitted.has(id));
      if (ok) score += 1;
    }
    const pct = max > 0 ? Math.round((score / max) * 100) : 0;
    const passed = pct >= (training.pass_threshold ?? 70);

    const { data: attempt, error } = await context.supabase.from("training_attempts").insert({
      training_id: data.training_id,
      user_id: context.userId,
      answers: data.answers,
      points_awarded: score,
      max_score: max,
      passed,
      submitted_at: new Date().toISOString(),
    }).select("id").maybeSingle();
    if (error) throw new Error(error.message);

    return { attempt_id: attempt?.id, score, max, pct, passed };
  });

// Historique des tentatives de l'utilisateur.
export const listMyAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("training_attempts")
      .select("id, training_id, points_awarded, max_score, passed, submitted_at, trainings(title, slug)")
      .eq("user_id", context.userId)
      .order("submitted_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });
