import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Anonymous access: only what the `anon` row-level security policies expose.
async function publicClient() {
  const { supabasePublic } = await import("@/integrations/supabase/client.server");
  return supabasePublic;
}

export const listPublishedNews = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await publicClient();
  const { data, error } = await supabase
    .from("news")
    .select("id, title, slug, excerpt, tag, cover_url, published_at, created_at")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(60);
  if (error) return [];
  return data ?? [];
});

export const getPublicLawyer = createServerFn({ method: "GET" })
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("get_public_lawyer", { _id: data.id });
    if (error || !rows || rows.length === 0) return null;
    return rows[0];
  });

export const getPublicStats = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_public_stats");
  if (error || !data || data.length === 0) {
    return { lawyers_total: 0, firms_total: 0, licenses_active: 0, exams_total: 0, news_published: 0 };
  }
  const r = data[0];
  return {
    lawyers_total: Number(r.lawyers_total ?? 0),
    firms_total: Number(r.firms_total ?? 0),
    licenses_active: Number(r.licenses_active ?? 0),
    exams_total: Number(r.exams_total ?? 0),
    news_published: Number(r.news_published ?? 0),
  };
});


export const listSiteContent = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await publicClient();
  const { data, error } = await supabase.from("site_content").select("key, title, body");
  if (error) return [];
  return data ?? [];
});

export const getSiteContent = createServerFn({ method: "GET" })
  .inputValidator((input: { key: string }) => z.object({ key: z.string().min(1).max(60) }).parse(input))
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    const { data: row, error } = await supabase
      .from("site_content")
      .select("key, title, body")
      .eq("key", data.key)
      .maybeSingle();
    if (error) return null;
    return row;
  });

// ============ CONTACT ============
const contactSchema = z.object({
  first_name: z.string().trim().min(1).max(60),
  last_name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(5).max(4000),
});

export const submitContactRequest = createServerFn({ method: "POST" })
  .inputValidator((data: z.infer<typeof contactSchema>) => contactSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = await publicClient();
    const { error } = await supabase.from("contact_requests").insert(data);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
