import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: any; userId: string; claims?: Record<string, unknown> };

async function requireActiveFirmId(context: Ctx): Promise<string> {
  const fromClaims = (context.claims?.firm_id as string | undefined) ?? null;
  if (fromClaims) return fromClaims;

  const { data: profile, error } = await context.supabase
    .from("profiles")
    .select("active_firm_id")
    .eq("id", context.userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const firmId = (profile?.active_firm_id as string | null) ?? null;
  if (!firmId) throw new Error("Aucune entreprise active sélectionnée.");
  return firmId;
}

function parseNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function detectCurrency(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes(" usd") || lower.includes("$")) return "USD";
  if (lower.includes(" xaf")) return "XAF";
  if (lower.includes(" xof")) return "XOF";
  if (lower.includes(" gbp") || lower.includes("£")) return "GBP";
  if (lower.includes(" cad")) return "CAD";
  return "EUR";
}

function parseDateCandidate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const dmy = raw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) {
    const dd = dmy[1].padStart(2, "0");
    const mm = dmy[2].padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const ymd = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  return null;
}

function classifyMessage(input: {
  content: string;
  embeds?: unknown;
  occurredAt?: string | null;
}): {
  side: "revenue" | "expense" | "unclassified";
  entryType: string | null;
  invoiceNumber: string | null;
  counterparty: string | null;
  description: string | null;
  amount: number | null;
  currency: string;
  operationDate: string | null;
  dueDate: string | null;
  status: string;
  paymentDate: string | null;
  needsClassification: boolean;
} {
  const embedText = Array.isArray(input.embeds)
    ? input.embeds
        .map((e: any) => `${String(e?.title ?? "")} ${String(e?.description ?? "")}`.trim())
        .join(" ")
    : "";
  const text = `${input.content ?? ""} ${embedText}`.trim();
  const lower = text.toLowerCase();

  const revenueHints = [
    "facture client",
    "paiement reçu",
    "paiement recu",
    "encaissement",
    "facture payée",
    "facture payee",
    "invoice paid",
    "payment received",
  ];
  const expenseHints = [
    "facture fournisseur",
    "paiement effectué",
    "paiement effectue",
    "achat",
    "charge",
    "dépense",
    "depense",
    "payment sent",
    "supplier",
  ];

  const isRevenue = revenueHints.some((hint) => lower.includes(hint));
  const isExpense = expenseHints.some((hint) => lower.includes(hint));

  const invoiceMatch = text.match(/(?:facture|invoice)\s*(?:#|n[o°])?\s*([a-zA-Z0-9-]{3,})/i);
  const amountMatch = text.match(/(-?\d[\d\s.,]*)\s*(€|eur|usd|\$|xaf|xof|cad|gbp)/i);
  const dueMatch = text.match(/(?:echeance|échéance|due date)\s*[:\-]?\s*([\d\/-]{8,10}|\d{4}-\d{2}-\d{2})/i);
  const paidMatch = text.match(/(?:date de paiement|paid on|payée le|payee le)\s*[:\-]?\s*([\d\/-]{8,10}|\d{4}-\d{2}-\d{2})/i);

  const side = isRevenue && !isExpense
    ? "revenue"
    : isExpense && !isRevenue
      ? "expense"
      : "unclassified";

  let entryType: string | null = null;
  if (side === "revenue") {
    if (lower.includes("paiement")) entryType = "payment_received";
    else if (lower.includes("encaissement")) entryType = "cash_in";
    else entryType = "client_invoice";
  }
  if (side === "expense") {
    if (lower.includes("paiement")) entryType = "payment_sent";
    else if (lower.includes("achat")) entryType = "purchase";
    else if (lower.includes("charge") || lower.includes("dépense") || lower.includes("depense")) entryType = "expense";
    else entryType = "supplier_invoice";
  }

  const amount = parseNumber(amountMatch?.[1] ?? null);
  const currency = amountMatch?.[2] ? detectCurrency(amountMatch[2]) : detectCurrency(lower);
  const operationDate = parseDateCandidate(input.occurredAt ?? text) ?? parseDateCandidate(text);
  const dueDate = parseDateCandidate(dueMatch?.[1] ?? null);
  const paymentDate = parseDateCandidate(paidMatch?.[1] ?? null);

  const companyMatch = text.match(/(?:client|fournisseur|vendor|supplier)\s*[:\-]?\s*([^\n\r,;]{2,120})/i);
  const counterparty = companyMatch?.[1]?.trim() ?? null;

  const description = text.length > 0 ? text.slice(0, 600) : null;

  const needsClassification = side === "unclassified" || amount === null;
  const status = needsClassification ? "to_classify" : paymentDate ? "paid" : dueDate ? "pending" : "recorded";

  return {
    side,
    entryType,
    invoiceNumber: invoiceMatch?.[1] ?? null,
    counterparty,
    description,
    amount,
    currency,
    operationDate,
    dueDate,
    status,
    paymentDate,
    needsClassification,
  };
}

const companyPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(180),
  legal_name: z.string().trim().max(220).nullable().optional(),
  company_type: z.string().trim().max(120).nullable().optional(),
  internal_identifier: z.string().trim().max(120).nullable().optional(),
  discord_server_id: z.string().trim().max(120).nullable().optional(),
  discord_channel_id: z.string().trim().max(120).nullable().optional(),
  discord_channel_url: z.string().trim().max(500).nullable().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const listAccountingCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);
    const { data, error } = await context.supabase
      .from("accounting_companies")
      .select("id, name, legal_name, company_type, internal_identifier, discord_server_id, discord_channel_id, discord_channel_url, status, added_at, created_at")
      .eq("firm_id", firmId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAccountingCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => companyPayloadSchema.parse(d))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);
    const payload = {
      firm_id: firmId,
      name: data.name,
      legal_name: data.legal_name ?? null,
      company_type: data.company_type ?? null,
      internal_identifier: data.internal_identifier ?? null,
      discord_server_id: data.discord_server_id ?? null,
      discord_channel_id: data.discord_channel_id ?? null,
      discord_channel_url: data.discord_channel_url ?? null,
      status: data.status ?? "active",
      updated_by: context.userId,
    };

    if (data.id) {
      const { error } = await context.supabase
        .from("accounting_companies")
        .update(payload)
        .eq("id", data.id)
        .eq("firm_id", firmId);
      if (error) throw new Error(error.message);
      return { id: data.id, updated: true };
    }

    const { data: created, error } = await context.supabase
      .from("accounting_companies")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id, created: true };
  });

export const deleteAccountingCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);
    const { error } = await context.supabase
      .from("accounting_companies")
      .delete()
      .eq("id", data.id)
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAccountingCompanyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "active" | "inactive" }) => ({
    id: z.string().uuid().parse(d.id),
    status: z.enum(["active", "inactive"]).parse(d.status),
  }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);
    const { error } = await context.supabase
      .from("accounting_companies")
      .update({ status: data.status, updated_by: context.userId })
      .eq("id", data.id)
      .eq("firm_id", firmId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAccountingOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    company_id?: string | null;
    period_days?: number | null;
    side?: "all" | "revenue" | "expense" | "unclassified";
    status?: string | null;
    search?: string | null;
    only_to_classify?: boolean;
  } = {}) => d)
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);

    let q = context.supabase
      .from("accounting_operations")
      .select("id, company_id, source, discord_message_id, entry_side, entry_type, invoice_number, counterparty, description, amount, currency, operation_date, due_date, payment_date, status, needs_classification, created_at, updated_at")
      .eq("firm_id", firmId)
      .order("operation_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (data.company_id) q = q.eq("company_id", data.company_id);
    if (data.side && data.side !== "all") q = q.eq("entry_side", data.side);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.only_to_classify) q = q.eq("needs_classification", true);

    if (data.period_days && data.period_days > 0) {
      const from = new Date();
      from.setDate(from.getDate() - data.period_days);
      q = q.gte("operation_date", from.toISOString().slice(0, 10));
    }

    if (data.search && data.search.trim()) {
      const query = `%${data.search.trim()}%`;
      q = q.or(`invoice_number.ilike.${query},counterparty.ilike.${query},description.ilike.${query}`);
    }

    const [{ data: rows, error }, { data: companies }] = await Promise.all([
      q,
      context.supabase.from("accounting_companies").select("id, name").eq("firm_id", firmId),
    ]);

    if (error) throw new Error(error.message);

    const companyMap = new Map<string, string>();
    for (const company of companies ?? []) companyMap.set(company.id, company.name);

    return (rows ?? []).map((row: any) => ({
      ...row,
      company_name: row.company_id ? companyMap.get(row.company_id) ?? "-" : "-",
    }));
  });

export const listAccountingDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    company_id?: string | null;
    period_days?: number | null;
    side?: "all" | "revenue" | "expense" | "unclassified";
    status?: string | null;
  } = {}) => d)
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);

    let q = context.supabase
      .from("accounting_operations")
      .select("id, entry_side, invoice_number, amount, status, needs_classification, operation_date")
      .eq("firm_id", firmId);

    if (data.company_id) q = q.eq("company_id", data.company_id);
    if (data.side && data.side !== "all") q = q.eq("entry_side", data.side);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);

    const periodDays = Number(data.period_days ?? 30);
    if (periodDays > 0) {
      const from = new Date();
      from.setDate(from.getDate() - periodDays);
      q = q.gte("operation_date", from.toISOString().slice(0, 10));
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const safeRows = rows ?? [];

    let revenue = 0;
    let expense = 0;
    let paidInvoices = 0;
    let pendingInvoices = 0;
    let overdueInvoices = 0;

    for (const row of safeRows as any[]) {
      const amount = Number(row.amount ?? 0);
      if (row.entry_side === "revenue") revenue += amount;
      if (row.entry_side === "expense") expense += amount;
      if (row.invoice_number) {
        if (row.status === "paid") paidInvoices += 1;
        else if (row.status === "overdue") overdueInvoices += 1;
        else pendingInvoices += 1;
      }
    }

    return {
      revenue,
      expense,
      result: revenue - expense,
      paid_invoices: paidInvoices,
      pending_invoices: pendingInvoices,
      overdue_invoices: overdueInvoices,
      to_classify: (safeRows as any[]).filter((r) => r.needs_classification).length,
      operations_total: (safeRows as any[]).length,
    };
  });

export const updateAccountingOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    company_id?: string | null;
    entry_side?: "revenue" | "expense" | "unclassified";
    entry_type?: string | null;
    invoice_number?: string | null;
    counterparty?: string | null;
    description?: string | null;
    amount?: number | null;
    currency?: string | null;
    operation_date?: string | null;
    due_date?: string | null;
    payment_date?: string | null;
    status?: string | null;
    needs_classification?: boolean;
  }) => ({
    id: z.string().uuid().parse(d.id),
    company_id: z.string().uuid().nullable().optional().parse(d.company_id ?? undefined),
    entry_side: z.enum(["revenue", "expense", "unclassified"]).optional().parse(d.entry_side ?? undefined),
    entry_type: z.string().trim().max(120).nullable().optional().parse(d.entry_type ?? undefined),
    invoice_number: z.string().trim().max(120).nullable().optional().parse(d.invoice_number ?? undefined),
    counterparty: z.string().trim().max(220).nullable().optional().parse(d.counterparty ?? undefined),
    description: z.string().trim().max(2000).nullable().optional().parse(d.description ?? undefined),
    amount: z.number().nullable().optional().parse(d.amount ?? undefined),
    currency: z.string().trim().max(8).nullable().optional().parse(d.currency ?? undefined),
    operation_date: z.string().nullable().optional().parse(d.operation_date ?? undefined),
    due_date: z.string().nullable().optional().parse(d.due_date ?? undefined),
    payment_date: z.string().nullable().optional().parse(d.payment_date ?? undefined),
    status: z.string().trim().max(60).nullable().optional().parse(d.status ?? undefined),
    needs_classification: z.boolean().optional().parse(d.needs_classification ?? undefined),
  }))
  .handler(async ({ data, context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);
    const patch: Record<string, unknown> = {
      updated_by: context.userId,
    };

    const keys: Array<keyof typeof data> = [
      "company_id",
      "entry_side",
      "entry_type",
      "invoice_number",
      "counterparty",
      "description",
      "amount",
      "currency",
      "operation_date",
      "due_date",
      "payment_date",
      "status",
      "needs_classification",
    ];

    for (const key of keys) {
      if (data[key] !== undefined) patch[key] = data[key] as unknown;
    }

    const { error } = await context.supabase
      .from("accounting_operations")
      .update(patch)
      .eq("id", data.id)
      .eq("firm_id", firmId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAccountingAnomalies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);
    const { data, error } = await context.supabase
      .from("accounting_webhook_events")
      .select("id, company_id, discord_server_id, discord_channel_id, discord_message_id, author_name, content, processing_status, anomaly_reason, occurred_at, created_at")
      .eq("firm_id", firmId)
      .in("processing_status", ["anomaly", "pending"])
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

export type AccountingDiscordWebhookPayload = {
  firm_id?: string | null;
  server_id?: string | null;
  guild_id?: string | null;
  channel_id?: string | null;
  message_id?: string | null;
  date?: string | null;
  author?: string | null;
  content?: string | null;
  embeds?: unknown[];
  attachments?: unknown[];
};

export async function ingestAccountingDiscordWebhook(rawPayload: AccountingDiscordWebhookPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const payload = rawPayload ?? {};
  const explicitFirmId = payload.firm_id ?? null;
  const serverId = payload.server_id ?? payload.guild_id ?? null;
  const channelId = payload.channel_id ?? null;
  const messageId = payload.message_id ?? null;
  const occurredAt = payload.date ?? new Date().toISOString();
  const author = payload.author ?? null;
  const content = payload.content ?? "";
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  if (messageId) {
    const { data: existing } = await supabaseAdmin
      .from("accounting_operations")
      .select("id")
      .eq("discord_message_id", messageId)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return { status: "duplicate", operation_id: existing.id };
    }
  }

  let company: any = null;
  let companyMatchCount = 0;
  if (serverId && channelId) {
    const { data: companyRows, error: companyError } = await supabaseAdmin
      .from("accounting_companies")
      .select("id, firm_id, name")
      .eq("discord_server_id", serverId)
      .eq("discord_channel_id", channelId)
      .eq("status", "active");

    if (companyError) throw new Error(companyError.message);
    companyMatchCount = (companyRows ?? []).length;

    if (companyMatchCount === 1) {
      company = companyRows?.[0] ?? null;
    }
  }

  const firmId = explicitFirmId ?? company?.firm_id ?? null;

  if (!firmId) {
    const anomalyReason = companyMatchCount > 1 ? "multiple_companies_match" : "firm_not_resolved";
    const { data: unresolvedEvent, error: unresolvedError } = await supabaseAdmin
      .from("accounting_webhook_events")
      .insert({
        firm_id: null,
        company_id: null,
        source: "discord",
        discord_server_id: serverId,
        discord_channel_id: channelId,
        discord_message_id: messageId,
        occurred_at: occurredAt,
        author_name: author,
        content,
        embeds,
        attachments,
        raw_payload: payload,
        processing_status: "anomaly",
        anomaly_reason: anomalyReason,
      })
      .select("id")
      .single();

    if (unresolvedError) {
      if (unresolvedError.message.toLowerCase().includes("duplicate") || unresolvedError.message.toLowerCase().includes("unique")) {
        return { status: "duplicate", operation_id: null };
      }
      throw new Error(unresolvedError.message);
    }

    return {
      status: "anomaly",
      reason: anomalyReason,
      matched_company: null,
      webhook_event_id: unresolvedEvent.id,
    };
  }

  const classification = classifyMessage({
    content,
    embeds,
    occurredAt,
  });

  const anomalyReason = !company
    ? companyMatchCount > 1
      ? "multiple_companies_match"
      : "company_not_found"
    : classification.needsClassification
      ? "needs_manual_classification"
      : null;

  const webhookPayload: Record<string, unknown> = {
    firm_id: firmId,
    company_id: company?.id ?? null,
    source: "discord",
    discord_server_id: serverId,
    discord_channel_id: channelId,
    discord_message_id: messageId,
    occurred_at: occurredAt,
    author_name: author,
    content,
    embeds,
    attachments,
    raw_payload: payload,
    processing_status: anomalyReason ? "anomaly" : "processed",
    anomaly_reason: anomalyReason,
  };

  const { data: webhookEvent, error: webhookError } = await supabaseAdmin
    .from("accounting_webhook_events")
    .insert(webhookPayload)
    .select("id")
    .single();

  if (webhookError) {
    if (webhookError.message.toLowerCase().includes("duplicate") || webhookError.message.toLowerCase().includes("unique")) {
      return { status: "duplicate", operation_id: null };
    }
    throw new Error(webhookError.message);
  }

  if (!company) {
    return {
      status: "anomaly",
      reason: "company_not_found",
      webhook_event_id: webhookEvent.id,
    };
  }

  const opPayload = {
    firm_id: firmId,
    company_id: company.id,
    webhook_event_id: webhookEvent.id,
    source: "discord",
    discord_message_id: messageId,
    entry_side: classification.side,
    entry_type: classification.entryType,
    invoice_number: classification.invoiceNumber,
    counterparty: classification.counterparty,
    description: classification.description,
    amount: classification.amount,
    currency: classification.currency,
    operation_date: classification.operationDate,
    due_date: classification.dueDate,
    payment_date: classification.paymentDate,
    status: classification.status,
    needs_classification: classification.needsClassification,
    raw_payload: payload,
  };

  const { data: operation, error: operationError } = await supabaseAdmin
    .from("accounting_operations")
    .upsert(opPayload, { onConflict: "firm_id,discord_message_id" })
    .select("id")
    .single();

  if (operationError) throw new Error(operationError.message);

  return {
    status: classification.needsClassification ? "anomaly" : "created",
    reason: classification.needsClassification ? "needs_manual_classification" : null,
    webhook_event_id: webhookEvent.id,
    operation_id: operation.id,
    company_name: company.name,
  };
}
