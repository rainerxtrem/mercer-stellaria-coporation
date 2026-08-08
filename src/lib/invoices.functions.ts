import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logMatterActivity, withActorNames } from "@/lib/activity-log";
import { z } from "zod";


const DOC_LABEL = (kind: string) => (kind === "quote" ? "Devis" : "Facture");

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


// ============ SCHEMAS ============
const itemSchema = z.object({
  label: z.string().trim().min(1).max(300),
  description: z.string().max(2000).nullable().optional(),
  quantity: z.number().min(0).max(999999),
  unit_price: z.number().min(0).max(99999999),
});

const createSchema = z.object({
  kind: z.enum(["quote", "invoice"]),
  client_id: z.string().uuid().nullable().optional(),
  matter_id: z.string().uuid().nullable().optional(),
  currency: z.string().length(3).default("USD"),
  tax_rate: z.number().min(0).max(100).default(0),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  terms: z.string().max(4000).nullable().optional(),
  items: z.array(itemSchema).min(1).max(200),
});

function computeTotals(items: z.infer<typeof itemSchema>[], tax_rate: number) {
  const round = (n: number) => Math.round(n * 100) / 100;
  const lines = items.map((it) => ({ ...it, line_total: round(it.quantity * it.unit_price) }));
  const subtotal = round(lines.reduce((s, l) => s + l.line_total, 0));
  const tax_amount = round((subtotal * tax_rate) / 100);
  const total = round(subtotal + tax_amount);
  return { lines, subtotal, tax_amount, total };
}

// ============ LIST ============
export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind?: "quote" | "invoice"; status?: string; search?: string; client_id?: string; matter_id?: string } = {}) => d)
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    let q = context.supabase
      .from("invoices")
      .select("id, number, kind, status, issue_date, due_date, total, currency, client_snapshot, client_id, matter_id, converted_from_id, owner_id, updated_by")
      .eq("firm_id", firmId)
      .order("issue_date", { ascending: false })
      .order("number", { ascending: false });
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) q = q.ilike("number", `%${data.search}%`);
    if (data.client_id && /^[0-9a-f-]{36}$/i.test(data.client_id)) q = q.eq("client_id", data.client_id);
    if (data.matter_id && /^[0-9a-f-]{36}$/i.test(data.matter_id)) q = q.eq("matter_id", data.matter_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return withActorNames(context.supabase, rows ?? [], {
      owner_id: "owner_name",
      updated_by: "updated_by_name",
    });
  });

// ============ GET ============
export const getInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { data: inv, error } = await context.supabase
      .from("invoices")
      .select("*, clients(id,first_name,last_name,email,phone,address), matters(id,number,title)")
      .eq("id", data.id)
      .eq("firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Introuvable");
    const [{ data: items }, { data: payments }] = await Promise.all([
      context.supabase.from("invoice_items").select("*").eq("invoice_id", data.id).order("position"),
      context.supabase.from("invoice_payments").select("*").eq("invoice_id", data.id).order("received_on", { ascending: false }),
    ]);
    const [named] = await withActorNames(context.supabase, [inv], {
      owner_id: "owner_name",
      updated_by: "updated_by_name",
    });
    const namedPayments = await withActorNames(context.supabase, payments ?? [], {
      recorded_by: "recorded_by_name",
    });
    return { ...named, items: items ?? [], payments: namedPayments };
  });


// ============ CREATE ============
export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: z.infer<typeof createSchema>) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { lines, subtotal, tax_amount, total } = computeTotals(data.items, data.tax_rate);

    // Snapshot client
    let client_snapshot: Record<string, unknown> = {};
    if (data.client_id) {
      const { data: c } = await context.supabase
        .from("clients")
        .select("first_name,last_name,email,phone,address")
        .eq("id", data.client_id)
        .maybeSingle();
      if (c) client_snapshot = c;
    }
    // Snapshot owner (from profiles)
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const owner_snapshot = { full_name: prof?.full_name ?? "Avocat" };

    const { data: created, error } = await context.supabase
      .from("invoices")
      .insert({
        kind: data.kind,
        owner_id: context.userId,
        firm_id: firmId,
        client_id: data.client_id || null,
        matter_id: data.matter_id || null,
        currency: data.currency,
        tax_rate: data.tax_rate,
        subtotal, tax_amount, total,
        due_date: data.due_date || null,
        notes: data.notes || null,
        terms: data.terms || null,
        client_snapshot,
        owner_snapshot,
        number: "",
      } as any)
      .select("id, number, kind, public_token")
      .single();
    if (error) throw new Error(error.message);

    const itemsPayload = lines.map((l, i) => ({
      invoice_id: created.id,
      position: i,
      label: l.label,
      description: l.description ?? null,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.line_total,
    }));
    const { error: iErr } = await context.supabase.from("invoice_items").insert(itemsPayload);
    if (iErr) throw new Error(iErr.message);

    await logMatterActivity(
      context.supabase, context.userId, data.matter_id || null,
      `${created.kind}_created`,
      `${DOC_LABEL(created.kind)} ${created.number} créé`,
      { entity_type: "invoice", entity_id: created.id },
    );

    return created;

  });

// ============ UPDATE (draft only) ============
export const updateInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string } & Partial<z.infer<typeof createSchema>>) => {
    const id = z.string().uuid().parse(d.id);
    const { id: _i, ...rest } = d;
    return { id, ...createSchema.partial().parse(rest) };
  })
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { id, items, tax_rate, ...rest } = data;
    const { data: current } = await context.supabase
      .from("invoices")
      .select("status, tax_rate, client_id")
      .eq("id", id)
      .eq("firm_id", firmId)
      .maybeSingle();
    if (!current) throw new Error("Introuvable");
    if (["paid", "cancelled", "converted"].includes(current.status)) {
      throw new Error("Impossible de modifier : statut verrouillé");
    }

    const patch: Record<string, unknown> = { ...rest };
    if (tax_rate !== undefined) patch.tax_rate = tax_rate;

    // If matter_id is being set, force client_id to match the matter's client
    if (patch.matter_id) {
      const { data: m } = await context.supabase
        .from("matters")
        .select("client_id")
        .eq("id", patch.matter_id as string)
        .maybeSingle();
      if (m?.client_id) patch.client_id = m.client_id;
    }

    // Refresh client snapshot when client_id changes or is (re)set
    const newClientId = (patch.client_id as string | null | undefined);
    if (newClientId !== undefined && newClientId !== current.client_id) {
      if (newClientId) {
        const { data: c } = await context.supabase
          .from("clients")
          .select("first_name,last_name,email,phone,address")
          .eq("id", newClientId)
          .maybeSingle();
        patch.client_snapshot = c ?? {};
      } else {
        patch.client_snapshot = {};
      }
    }

    if (items && items.length > 0) {
      const effTax = tax_rate ?? current.tax_rate;
      const { lines, subtotal, tax_amount, total } = computeTotals(items, Number(effTax));
      patch.subtotal = subtotal;
      patch.tax_amount = tax_amount;
      patch.total = total;
      await context.supabase.from("invoice_items").delete().eq("invoice_id", id);
      await context.supabase.from("invoice_items").insert(
        lines.map((l, i) => ({
          invoice_id: id, position: i,
          label: l.label, description: l.description ?? null,
          quantity: l.quantity, unit_price: l.unit_price, line_total: l.line_total,
        })),
      );
    }

    const { error } = await context.supabase.from("invoices").update(patch as any).eq("id", id).eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    const { data: after } = await context.supabase
      .from("invoices").select("kind, number, matter_id").eq("id", id).maybeSingle();
    if (after) {
      await logMatterActivity(
        context.supabase, context.userId, after.matter_id,
        `${after.kind}_updated`,
        `${DOC_LABEL(after.kind)} ${after.number ?? ""} modifié`.trim(),
        { entity_type: "invoice", entity_id: id },
      );
    }
    return { id };

  });

// ============ STATUS ============
export const setInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) => ({
    id: z.string().uuid().parse(d.id),
    status: z.enum(["draft","sent","accepted","refused","paid","partial","overdue","cancelled","converted"]).parse(d.status),
  }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { error } = await context.supabase
      .from("invoices")
      .update({ status: data.status, ...(data.status === "paid" ? { paid_at: new Date().toISOString() } : {}) })
      .eq("id", data.id)
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    const { data: after } = await context.supabase
      .from("invoices").select("kind, number, matter_id").eq("id", data.id).maybeSingle();
    if (after) {
      await logMatterActivity(
        context.supabase, context.userId, after.matter_id,
        `${after.kind}_status`,
        `${DOC_LABEL(after.kind)} ${after.number ?? ""} → ${data.status}`.trim(),
        { entity_type: "invoice", entity_id: data.id, metadata: { status: data.status } },
      );
    }
    return { ok: true };

  });

// ============ CONVERT QUOTE → INVOICE ============
export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { data: q, error } = await context.supabase
      .from("invoices")
      .select("*")
      .eq("id", data.id)
      .eq("firm_id", firmId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!q || q.kind !== "quote") throw new Error("Devis introuvable");
    if (q.status === "converted") throw new Error("Déjà converti");

    const { data: items } = await context.supabase
      .from("invoice_items").select("position,label,description,quantity,unit_price,line_total")
      .eq("invoice_id", q.id).order("position");

    const { data: created, error: cErr } = await context.supabase
      .from("invoices")
      .insert({
        kind: "invoice",
        owner_id: q.owner_id,
        firm_id: q.firm_id,
        client_id: q.client_id,
        matter_id: q.matter_id,
        currency: q.currency,
        tax_rate: q.tax_rate,
        subtotal: q.subtotal, tax_amount: q.tax_amount, total: q.total,
        notes: q.notes, terms: q.terms,
        client_snapshot: q.client_snapshot,
        owner_snapshot: q.owner_snapshot,
        converted_from_id: q.id,
        number: "",
      } as any)
      .select("id, number")
      .single();
    if (cErr) throw new Error(cErr.message);

    if (items && items.length > 0) {
      await context.supabase.from("invoice_items").insert(
        items.map((it: any) => ({ ...it, invoice_id: created.id })),
      );
    }
    await context.supabase.from("invoices").update({ status: "converted" }).eq("id", q.id);
    await logMatterActivity(
      context.supabase, context.userId, q.matter_id,
      "quote_converted",
      `Devis ${q.number ?? ""} converti en facture ${created.number}`.trim(),
      { entity_type: "invoice", entity_id: created.id, metadata: { quote_id: q.id } },
    );
    return created;

  });

// ============ DELETE (draft only) ============
export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { data: cur } = await context.supabase
      .from("invoices").select("status, kind, number, matter_id").eq("id", data.id).eq("firm_id", firmId).maybeSingle();
    if (!cur) throw new Error("Introuvable");
    if (cur.status !== "draft") throw new Error("Seuls les brouillons peuvent être supprimés");
    const { error } = await context.supabase.from("invoices").delete().eq("id", data.id).eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    await logMatterActivity(
      context.supabase, context.userId, cur.matter_id,
      `${cur.kind}_deleted`,
      `${DOC_LABEL(cur.kind)} ${cur.number ?? ""} supprimé`.trim(),
      { entity_type: "invoice", entity_id: data.id },
    );
    return { ok: true };
  });


// ============ RECORD PAYMENT ============
export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string; amount: number; method: string; reference?: string; received_on?: string }) => ({
    invoice_id: z.string().uuid().parse(d.invoice_id),
    amount: z.number().positive().max(99999999).parse(d.amount),
    method: z.enum(["cash","transfer","check","card","other"]).parse(d.method),
    reference: z.string().max(200).optional().parse(d.reference),
    received_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().parse(d.received_on),
  }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as any);
    const { data: inv } = await context.supabase
      .from("invoices").select("total, paid_amount, kind, number, matter_id, currency").eq("id", data.invoice_id).eq("firm_id", firmId).maybeSingle();

    if (!inv) throw new Error("Facture introuvable");
    if (inv.kind !== "invoice") throw new Error("Paiement uniquement pour les factures");

    const { error: pErr } = await context.supabase.from("invoice_payments").insert({
      invoice_id: data.invoice_id,
      amount: data.amount,
      method: data.method,
      reference: data.reference ?? null,
      received_on: data.received_on ?? new Date().toISOString().slice(0, 10),
      recorded_by: context.userId,
    });
    if (pErr) throw new Error(pErr.message);

    const newPaid = Math.round((Number(inv.paid_amount) + data.amount) * 100) / 100;
    const status = newPaid >= Number(inv.total) - 0.005 ? "paid" : "partial";
    await context.supabase.from("invoices").update({
      paid_amount: newPaid,
      status,
      ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
    }).eq("id", data.invoice_id);

    await logMatterActivity(
      context.supabase, context.userId, inv.matter_id,
      "payment_recorded",
      `Paiement de ${data.amount} ${inv.currency ?? ""} enregistré sur la facture ${inv.number ?? ""}`.trim(),
      { entity_type: "invoice", entity_id: data.invoice_id, metadata: { amount: data.amount, status } },
    );

    return { paid_amount: newPaid, status };

  });

// ============ PUBLIC VERIFY (unauthenticated) ============
export const verifyInvoicePublic = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => ({ token: z.string().uuid().parse(d.token) }))
  .handler(async ({ data }) => {
    // Use service-role client to fetch only public-safe columns; token is unguessable
    // and the anon role has no direct access to the invoices table (RLS + revoked grants).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("invoices")
      .select("number, kind, status, issue_date, total, currency, owner_snapshot, client_snapshot")
      .eq("public_token", data.token)
      .not("status", "in", "(draft,cancelled)")
      .maybeSingle();
    if (error) return { found: false as const };
    if (!row) return { found: false as const };
    const cs: any = row.client_snapshot ?? {};
    const clientName = [cs.first_name, cs.last_name].filter(Boolean).join(" ") || null;
    return {
      found: true as const,
      number: row.number,
      kind: row.kind,
      status: row.status,
      issue_date: row.issue_date,
      total: Number(row.total),
      currency: row.currency,
      owner_full_name: (row.owner_snapshot as any)?.full_name ?? null,
      client_name: clientName,
    };
  });

// ============ RENDER PDF ============
export const renderInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; origin: string }) => ({
    id: z.string().uuid().parse(d.id),
    origin: z.string().url().parse(d.origin),
  }))
  .handler(async ({ data, context }) => {
    const { data: inv, error } = await context.supabase
      .from("invoices").select("*, matters(id,number,title)").eq("id", data.id).maybeSingle();
    if (error || !inv) throw new Error("Introuvable");
    const { data: items } = await context.supabase
      .from("invoice_items").select("*").eq("invoice_id", data.id).order("position");

    const qrMod = await import("qrcode-generator");
    const qrcode = (qrMod as any).default ?? (qrMod as any);
    const { buildInvoicePdf } = await import("@/lib/pdf/invoice-pdf");
    const bytes = buildInvoicePdf({
      invoice: inv as any,
      items: (items ?? []) as any[],
      verifyUrl: `${data.origin}/verification/facture/${(inv as any).public_token}`,
      qrcode,
    });
    return { filename: `${inv.number}.pdf`, base64: Buffer.from(bytes).toString("base64") };
  });
