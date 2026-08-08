import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function getMyFirmId(context: { supabase: any; userId: string }): Promise<string> {
  const { data: isBat } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "batonnier" });
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: lw, error } = await supabaseAdmin
    .from("lawyers").select("firm_id").eq("profile_id", context.userId).maybeSingle();
  if (error) throw new Error(error.message);
  const firmId = (lw?.firm_id ?? null) as string | null;
  if (!firmId && !isBat) throw new Error("Aucun cabinet associé à ce compte.");
  return firmId as string;
}


async function assertCabinetAccess(context: { supabase: any; userId: string }, firmId?: string) {
  const { data: roles } = await context.supabase
    .from("user_roles").select("role").eq("user_id", context.userId);
  const rs = (roles ?? []).map((r: any) => r.role);
  if (rs.includes("batonnier")) return firmId ?? (await getMyFirmId(context));
  if (!rs.includes("responsable_cabinet")) throw new Error("Accès refusé : rôle Responsable de cabinet requis.");
  const my = await getMyFirmId(context);
  if (firmId && firmId !== my) throw new Error("Vous ne pouvez consulter que votre propre cabinet.");
  return my;
}

export const getMyFirm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertCabinetAccess(context);
    const { data, error } = await context.supabase.from("firms").select("*").eq("id", firmId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const getFirmStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertCabinetAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: base, error } = await supabaseAdmin.rpc("get_firm_stats", { _firm_id: firmId });
    if (error) throw new Error(error.message);
    const row = Array.isArray(base) ? base[0] : base;

    // Firm member profile ids for scoped counts
    const { data: members } = await supabaseAdmin
      .from("lawyers").select("profile_id, first_name, last_name").eq("firm_id", firmId).not("profile_id", "is", null);
    const profileIds = (members ?? []).map((m: any) => m.profile_id);

    let quotes_total = 0;
    let clients_total = 0;
    let assistants_total = 0;
    let monthly: Array<{ month: string; revenue: number; matters: number }> = [];
    let recent: Array<{ id: string; entity_type: string; action: string; summary: string | null; created_at: string }> = [];

    if (profileIds.length > 0) {
      const [{ count: qc }, { count: cc }] = await Promise.all([
        supabaseAdmin.from("invoices").select("id", { count: "exact", head: true }).in("owner_id", profileIds).eq("kind", "quote"),
        supabaseAdmin.from("clients").select("id", { count: "exact", head: true }).in("owner_id", profileIds),
      ]);
      quotes_total = qc ?? 0;
      clients_total = cc ?? 0;

      // Assistants: user_roles=assistant AND their user_id appears as a matter_assistant on our matters — approximation
      const { data: mattersOfFirm } = await supabaseAdmin
        .from("matters").select("id").in("owner_id", profileIds);
      const matterIds = (mattersOfFirm ?? []).map((m: any) => m.id);
      if (matterIds.length > 0) {
        const { data: ma } = await supabaseAdmin
          .from("matter_assistants").select("user_id").in("matter_id", matterIds);
        assistants_total = new Set((ma ?? []).map((a: any) => a.user_id)).size;
      }

      // Monthly revenue + matters (last 6 months, paid_amount)
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const [{ data: paidInv }, { data: openedMatters }] = await Promise.all([
        supabaseAdmin.from("invoices").select("issue_date, paid_amount").in("owner_id", profileIds).gte("issue_date", start.toISOString().slice(0, 10)),
        supabaseAdmin.from("matters").select("opened_on").in("owner_id", profileIds).gte("opened_on", start.toISOString().slice(0, 10)),
      ]);
      const buckets: Record<string, { revenue: number; matters: number }> = {};
      for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets[key] = { revenue: 0, matters: 0 };
      }
      for (const inv of paidInv ?? []) {
        const key = String(inv.issue_date ?? "").slice(0, 7);
        if (buckets[key]) buckets[key].revenue += Number(inv.paid_amount ?? 0);
      }
      for (const m of openedMatters ?? []) {
        const key = String(m.opened_on ?? "").slice(0, 7);
        if (buckets[key]) buckets[key].matters += 1;
      }
      monthly = Object.entries(buckets).map(([month, v]) => ({ month, revenue: v.revenue, matters: v.matters }));

      // Recent activity from audit_log where actor is a firm member
      const { data: audit } = await supabaseAdmin
        .from("audit_log").select("id, entity_type, action, summary, created_at")
        .in("actor_id", profileIds)
        .order("created_at", { ascending: false })
        .limit(10);
      recent = audit ?? [];
    }

    return {
      firmId,
      ...(row ?? {}),
      quotes_total,
      clients_total,
      assistants_total,
      monthly,
      recent,
    };
  });


export const listFirmMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertCabinetAccess(context);
    const { data, error } = await context.supabase
      .from("lawyers")
      .select("id, license, first_name, last_name, specialty, city, status, admitted_on, email, phone, photo_url, profile_id")
      .eq("firm_id", firmId)
      .order("last_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listFirmMatters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertCabinetAccess(context);
    const { data: members } = await context.supabase
      .from("lawyers").select("profile_id, first_name, last_name").eq("firm_id", firmId).not("profile_id", "is", null);
    const ids = (members ?? []).map((m: any) => m.profile_id);
    if (ids.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("matters")
      .select("id, number, title, status, type, opened_on, owner_id, client_id, clients!matters_client_id_fkey(first_name, last_name)")
      .in("owner_id", ids)
      .order("opened_on", { ascending: false });
    if (error) throw new Error(error.message);
    const map = new Map(members!.map((m: any) => [m.profile_id, `${m.first_name} ${m.last_name}`]));
    return (data ?? []).map((m: any) => ({ ...m, owner_name: map.get(m.owner_id) ?? null }));
  });

export const listFirmInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertCabinetAccess(context);
    const { data: members } = await context.supabase
      .from("lawyers").select("profile_id, first_name, last_name").eq("firm_id", firmId).not("profile_id", "is", null);
    const ids = (members ?? []).map((m: any) => m.profile_id);
    if (ids.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select("id, number, kind, status, issue_date, due_date, total, paid_amount, currency, owner_id, client_snapshot")
      .in("owner_id", ids)
      .order("issue_date", { ascending: false });
    if (error) throw new Error(error.message);
    const map = new Map(members!.map((m: any) => [m.profile_id, `${m.first_name} ${m.last_name}`]));
    return (data ?? []).map((i: any) => ({ ...i, owner_name: map.get(i.owner_id) ?? null }));
  });

export const listFirmTrainings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await assertCabinetAccess(context);
    const { data: members } = await context.supabase
      .from("lawyers").select("profile_id, first_name, last_name").eq("firm_id", firmId).not("profile_id", "is", null);
    const ids = (members ?? []).map((m: any) => m.profile_id);
    if (ids.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("training_attempts")
      .select("id, user_id, training_id, status, score, completed_at, trainings(title, points)")
      .in("user_id", ids)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const map = new Map(members!.map((m: any) => [m.profile_id, `${m.first_name} ${m.last_name}`]));
    return (data ?? []).map((t: any) => ({ ...t, user_name: map.get(t.user_id) ?? null }));
  });

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  address: z.string().max(200).nullable().optional(),
  manager: z.string().max(100).nullable().optional(),
  logo_url: z.string().url().max(500).nullable().optional(),
});

export const updateMyFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertCabinetAccess(context);
    const patch: any = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined) patch[k] = v === "" ? null : v;
    const { error } = await context.supabase.from("firms").update(patch).eq("id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFirmMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ lawyer_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertCabinetAccess(context);
    // Verify the lawyer belongs to this firm
    const { data: lw, error: e1 } = await context.supabase
      .from("lawyers").select("id, firm_id").eq("id", data.lawyer_id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!lw || lw.firm_id !== firmId) throw new Error("Ce membre n'appartient pas à votre cabinet.");
    const { error } = await context.supabase.from("lawyers").update({ firm_id: null }).eq("id", data.lawyer_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const inviteSchema = z.object({
  email: z.string().trim().email(),
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  role: z.enum(["avocat", "assistant"]),
  license: z.string().trim().min(1).optional(),
  specialty: z.string().trim().optional(),
  city: z.string().trim().optional(),
  redirect_to: z.string().url(),
});

export const inviteFirmMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await assertCabinetAccess(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role === "avocat") {
      if (!data.license) throw new Error("Numéro de licence requis pour un avocat.");
      const { data: existing } = await context.supabase
        .from("lawyers").select("id").eq("license", data.license).maybeSingle();
      if (existing) {
        await context.supabase.from("lawyers").update({
          firm_id: firmId, email: data.email, first_name: data.first_name, last_name: data.last_name,
          specialty: data.specialty ?? null, city: data.city ?? null,
        }).eq("id", existing.id);
      } else {
        const { error: insErr } = await context.supabase.from("lawyers").insert({
          license: data.license, first_name: data.first_name, last_name: data.last_name,
          email: data.email, firm_id: firmId, specialty: data.specialty ?? null, city: data.city ?? null,
          admitted_on: new Date().toISOString().slice(0, 10), status: "active",
        });
        if (insErr) throw new Error(insErr.message);
      }
    }

    const { error: invErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: data.redirect_to,
      data: { full_name: `${data.first_name} ${data.last_name}`, invited_role: data.role, firm_id: firmId },
    });
    if (invErr) {
      const msg = invErr.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        // If assistant already exists, assign role
        if (data.role === "assistant") {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const u = users?.users.find((x) => (x.email ?? "").toLowerCase() === data.email.toLowerCase());
          if (u) {
            await supabaseAdmin.from("user_roles").insert({ user_id: u.id, role: "assistant" }).select();
          }
        }
        return { ok: true, alreadyRegistered: true };
      }
      throw new Error(invErr.message);
    }
    return { ok: true, alreadyRegistered: false };
  });
