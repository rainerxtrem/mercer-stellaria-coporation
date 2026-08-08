import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "form";

async function assertBatonnier(context: any) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "batonnier" });
  if (!data) throw new Error("Accès réservé à la direction.");
}

// ---------- CATEGORIES ----------
export const listTrainingCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("training_categories").select("id, name, slug").order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertTrainingCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(80),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const payload = { name: data.name, slug: slugify(data.name) };
    if (data.id) {
      const { error } = await context.supabase.from("training_categories").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: r, error } = await context.supabase.from("training_categories").insert(payload).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return r;
  });

export const deleteTrainingCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("training_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- TRAININGS ----------
export const listTrainingsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertBatonnier(context);
    const { data, error } = await context.supabase
      .from("trainings")
      .select("id, title, slug, status, points, pass_threshold, duration_min, category_id, updated_at, training_categories(name)")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getTrainingAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const [{ data: training }, { data: modules }, { data: questions }] = await Promise.all([
      context.supabase.from("trainings").select("*, training_categories(name)").eq("id", data.id).maybeSingle(),
      context.supabase.from("training_modules").select("*").eq("training_id", data.id).order("position"),
      context.supabase.from("training_questions").select("*").eq("training_id", data.id).order("position"),
    ]);
    const qIds = (questions ?? []).map((q: any) => q.id);
    const { data: choices } = qIds.length
      ? await context.supabase.from("training_choices").select("*").in("question_id", qIds).order("position")
      : { data: [] as any[] };
    return { training, modules: modules ?? [], questions: questions ?? [], choices: choices ?? [] };
  });

export const upsertTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    slug: z.string().trim().optional(),
    description: z.string().max(2000).nullable().optional(),
    category_id: z.string().uuid().nullable().optional(),
    points: z.number().int().min(0).max(1000).optional(),
    pass_threshold: z.number().int().min(0).max(100).optional(),
    duration_min: z.number().int().min(1).max(1000).optional(),
    cover_url: z.string().url().nullable().optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const payload: any = {
      title: data.title,
      slug: data.slug?.trim() || slugify(data.title),
      description: data.description ?? null,
      category_id: data.category_id ?? null,
      points: data.points ?? 0,
      pass_threshold: data.pass_threshold ?? 70,
      duration_min: data.duration_min ?? 30,
      cover_url: data.cover_url ?? null,
      status: data.status ?? "draft",
    };
    if (data.status === "published" && !data.id) payload.published_at = new Date().toISOString();
    if (data.id) {
      // Set published_at first time it transitions to published
      const { data: prev } = await context.supabase.from("trainings").select("status, published_at").eq("id", data.id).maybeSingle();
      if (payload.status === "published" && (prev as any)?.status !== "published" && !(prev as any)?.published_at) {
        payload.published_at = new Date().toISOString();
      }
      const { error } = await context.supabase.from("trainings").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    payload.created_by = context.userId;
    const { data: r, error } = await context.supabase.from("trainings").insert(payload).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return r;
  });

export const deleteTraining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("trainings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- MODULES ----------
export const upsertTrainingModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    training_id: z.string().uuid(),
    title: z.string().trim().min(1).max(200),
    content: z.string().max(50_000).nullable().optional(),
    video_url: z.string().url().nullable().optional(),
    position: z.number().int().min(0).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const payload = {
      training_id: data.training_id,
      title: data.title,
      content: data.content ?? null,
      video_url: data.video_url ?? null,
      position: data.position ?? 0,
    };
    if (data.id) {
      const { error } = await context.supabase.from("training_modules").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: r, error } = await context.supabase.from("training_modules").insert(payload).select("id").maybeSingle();
    if (error) throw new Error(error.message);
    return r;
  });

export const deleteTrainingModule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("training_modules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    for (let i = 0; i < data.ids.length; i++) {
      await context.supabase.from("training_modules").update({ position: i }).eq("id", data.ids[i]);
    }
    return { ok: true };
  });

// ---------- QUESTIONS / CHOICES ----------
export const upsertTrainingQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(),
    training_id: z.string().uuid(),
    prompt: z.string().trim().min(1).max(1000),
    kind: z.enum(["single", "multi", "boolean"]),
    position: z.number().int().min(0).optional(),
    choices: z.array(z.object({
      id: z.string().uuid().optional(),
      label: z.string().trim().min(1).max(500),
      is_correct: z.boolean(),
      position: z.number().int().min(0).optional(),
    })).min(2).max(10),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    let qId = data.id;
    if (qId) {
      const { error } = await context.supabase.from("training_questions")
        .update({ prompt: data.prompt, kind: data.kind, position: data.position ?? 0 })
        .eq("id", qId);
      if (error) throw new Error(error.message);
      // Sync choices : delete removed, upsert others
      const { data: existing } = await context.supabase.from("training_choices").select("id").eq("question_id", qId);
      const keepIds = new Set(data.choices.map((c) => c.id).filter(Boolean));
      const toDelete = (existing ?? []).filter((c: any) => !keepIds.has(c.id)).map((c: any) => c.id);
      if (toDelete.length) await context.supabase.from("training_choices").delete().in("id", toDelete);
    } else {
      const { data: r, error } = await context.supabase.from("training_questions")
        .insert({ training_id: data.training_id, prompt: data.prompt, kind: data.kind, position: data.position ?? 0 })
        .select("id").maybeSingle();
      if (error) throw new Error(error.message);
      qId = r?.id;
    }
    for (let i = 0; i < data.choices.length; i++) {
      const c = data.choices[i];
      const payload = { question_id: qId!, label: c.label, is_correct: c.is_correct, position: i };
      if (c.id) {
        await context.supabase.from("training_choices").update(payload).eq("id", c.id);
      } else {
        await context.supabase.from("training_choices").insert(payload);
      }
    }
    return { id: qId };
  });

export const deleteTrainingQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { error } = await context.supabase.from("training_questions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- ATTEMPTS / RESULTS ----------
export const listAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ training_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { data: rows, error } = await context.supabase
      .from("training_attempts")
      .select("id, user_id, points_awarded, max_score, passed, submitted_at")
      .eq("training_id", data.training_id)
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);
    // Enrichir avec le nom depuis lawyers/profiles
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: lawyers } = userIds.length
      ? await context.supabase.from("lawyers").select("profile_id, first_name, last_name, license").in("profile_id", userIds)
      : { data: [] as any[] };
    const map = new Map((lawyers ?? []).map((l: any) => [l.profile_id, l]));
    return (rows ?? []).map((r: any) => ({
      ...r,
      lawyer: map.get(r.user_id) ?? null,
    }));
  });

export const adjustAttemptScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    attempt_id: z.string().uuid(),
    delta_points: z.number().int().min(-1000).max(1000),
    reason: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertBatonnier(context);
    const { data: att } = await context.supabase.from("training_attempts")
      .select("points_awarded, max_score, training_id").eq("id", data.attempt_id).maybeSingle();
    if (!att) throw new Error("Tentative introuvable");
    const { data: t } = await context.supabase.from("trainings").select("pass_threshold").eq("id", (att as any).training_id).maybeSingle();
    const newPts = Math.max(0, ((att as any).points_awarded ?? 0) + data.delta_points);
    const max = (att as any).max_score ?? 0;
    const pct = max > 0 ? Math.round((newPts / max) * 100) : 0;
    const passed = pct >= ((t as any)?.pass_threshold ?? 70);
    await context.supabase.from("training_attempts")
      .update({ points_awarded: newPts, passed }).eq("id", data.attempt_id);
    await context.supabase.from("training_manual_adjustments").insert({
      attempt_id: data.attempt_id,
      delta_points: data.delta_points,
      reason: data.reason ?? null,
      granted_by: context.userId,
    });
    return { points_awarded: newPts, passed, pct };
  });
