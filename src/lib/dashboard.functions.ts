import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [
      mattersRes,
      clientsRes,
      invoicesRes,
      recentMattersRes,
      recentInvoicesRes,
      activityRes,
    ] = await Promise.all([
      supabase.from("matters").select("id, status", { count: "exact" }).eq("owner_id", userId),
      supabase.from("clients").select("id", { count: "exact", head: true }).eq("owner_id", userId),
      supabase
        .from("invoices")
        .select("id, kind, status, total, paid_amount, currency, due_date, issue_date")
        .eq("owner_id", userId),
      supabase
        .from("matters")
        .select("id, number, title, status, updated_at")
        .eq("owner_id", userId)
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase
        .from("invoices")
        .select("id, number, kind, status, total, currency, issue_date, due_date")
        .eq("owner_id", userId)
        .order("issue_date", { ascending: false })
        .limit(5),
      supabase
        .from("matter_activity")
        .select("id, matter_id, action, summary, created_at")
        .eq("actor_id", userId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const matters = mattersRes.data ?? [];
    const invoices = invoicesRes.data ?? [];
    const today = new Date().toISOString().slice(0, 10);

    const mattersByStatus: Record<string, number> = {};
    for (const m of matters) mattersByStatus[m.status] = (mattersByStatus[m.status] ?? 0) + 1;

    const quotes = invoices.filter((i) => i.kind === "quote");
    const factures = invoices.filter((i) => i.kind === "invoice");

    const outstanding = factures
      .filter((i) => ["sent", "partial", "overdue"].includes(i.status as string))
      .reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount ?? 0)), 0);

    const collected = factures
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + Number(i.total), 0);

    const overdue = factures.filter(
      (i) => i.due_date && i.due_date < today && !["paid", "cancelled", "converted"].includes(i.status as string),
    ).length;

    const upcoming = factures
      .filter((i) => i.due_date && i.due_date >= today && !["paid", "cancelled"].includes(i.status as string))
      .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
      .slice(0, 5);

    return {
      stats: {
        mattersTotal: mattersRes.count ?? matters.length,
        mattersOpen: mattersByStatus["open"] ?? 0,
        mattersPending: mattersByStatus["pending"] ?? 0,
        mattersInstance: mattersByStatus["instance"] ?? 0,
        mattersClosed: mattersByStatus["closed"] ?? 0,
        clientsTotal: clientsRes.count ?? 0,
        quotesDraft: quotes.filter((q) => q.status === "draft").length,
        quotesSent: quotes.filter((q) => q.status === "sent").length,
        invoicesOutstanding: Math.round(outstanding * 100) / 100,
        invoicesCollected: Math.round(collected * 100) / 100,
        invoicesOverdue: overdue,
      },
      recentMatters: recentMattersRes.data ?? [],
      recentInvoices: recentInvoicesRes.data ?? [],
      upcomingInvoices: upcoming,
      activity: activityRes.data ?? [],
    };
  });

export const globalSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q: string }) => ({ q: z.string().trim().min(1).max(100).parse(d.q) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { ilikePattern } = await import("@/lib/search-filter");
    // Strict allowlist sanitizing: no PostgREST filter separators or ilike wildcards survive.
    const like = ilikePattern(data.q);
    if (!like) return { clients: [], matters: [], invoices: [] };


    const [clientsRes, mattersRes, invoicesRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, first_name, last_name, email")
        .eq("owner_id", userId)
        .or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like}`)
        .limit(6),
      supabase
        .from("matters")
        .select("id, number, title, status")
        .eq("owner_id", userId)
        .or(`title.ilike.${like},number.ilike.${like}`)
        .limit(6),
      supabase
        .from("invoices")
        .select("id, number, kind, status, total, currency")
        .eq("owner_id", userId)
        .or(`number.ilike.${like}`)
        .limit(6),
    ]);

    return {
      clients: clientsRes.data ?? [],
      matters: mattersRes.data ?? [],
      invoices: invoicesRes.data ?? [],
    };
  });
