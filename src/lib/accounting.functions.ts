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

function cleanCounterparty(raw: string | null | undefined): string | null {
  const value = String(raw ?? "")
    .replace(/\*/g, "")
    .replace(/^[:\-\s]+|[:\-\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return value.length > 0 ? value : null;
}

function isValidInvoiceToken(value: string | null | undefined): boolean {
  const token = String(value ?? "").trim();
  if (token.length < 2) return false;
  const lowered = token.toLowerCase();
  const blocked = new Set(["de", "du", "des", "la", "le", "les", "pour", "par", "sur"]);
  if (blocked.has(lowered)) return false;
  if (/^[a-z]{2,3}$/i.test(token)) return false;
  return true;
}

type InvoicePrefix = "H" | "I" | "L" | "F";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractInvoicePrefix(invoiceNumber: string | null | undefined, rawText: string): InvoicePrefix | null {
  const fromNumber = String(invoiceNumber ?? "").match(/^\s*([HILF])\s*-/i)?.[1]?.toUpperCase();
  if (fromNumber && ["H", "I", "L", "F"].includes(fromNumber)) {
    return fromNumber as InvoicePrefix;
  }

  const fromText = rawText.match(/(?:facture|invoice)\s*(?:#|n[o°])?\s*([HILF])\s*-/i)?.[1]?.toUpperCase();
  if (fromText && ["H", "I", "L", "F"].includes(fromText)) {
    return fromText as InvoicePrefix;
  }

  return null;
}

function deriveCompanyPrefix(company: {
  name?: string | null;
  legal_name?: string | null;
  company_type?: string | null;
  internal_identifier?: string | null;
}): InvoicePrefix | null {
  const internal = String(company.internal_identifier ?? "").trim().toUpperCase();
  const internalMatch = internal.match(/^([HILF])(?:\s*-.*)?$/)?.[1] ?? null;
  if (internalMatch) return internalMatch as InvoicePrefix;

  const haystack = normalizeText(
    [company.name, company.legal_name, company.company_type].filter(Boolean).join(" "),
  );

  if (/(^|\s)(holding|corporation)(\s|$)/.test(haystack)) return "H";
  if (/(^|\s)(insurance|assurance)(\s|$)/.test(haystack)) return "I";
  if (/(^|\s)(law office|cabinet d avocat|cabinet avocat|cabinet)(\s|$)/.test(haystack)) return "L";
  if (/(^|\s)(financial|finance)(\s|$)/.test(haystack)) return "F";

  return null;
}

function resolveCompanyFromPrefix<T extends {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  company_type?: string | null;
  internal_identifier?: string | null;
}>(companies: T[], prefix: InvoicePrefix | null): T | null {
  if (!prefix) return null;
  const candidates = companies.filter((company) => deriveCompanyPrefix(company) === prefix);
  if (candidates.length === 1) return candidates[0];
  return null;
}

function resolveHoldingCompany<T extends {
  id: string;
  name?: string | null;
  legal_name?: string | null;
  company_type?: string | null;
  internal_identifier?: string | null;
}>(companies: T[]): T | null {
  const holdingByPrefix = companies.filter((company) => deriveCompanyPrefix(company) === "H");
  if (holdingByPrefix.length === 1) return holdingByPrefix[0];

  const exactCorporate = companies.find((company) =>
    normalizeText(company.name).includes("mercer & stellaria corporation"),
  );
  if (exactCorporate) return exactCorporate;

  const byName = companies.filter((company) =>
    /(^|\s)(holding|corporation)(\s|$)/.test(normalizeText([company.name, company.legal_name].filter(Boolean).join(" "))),
  );
  if (byName.length === 1) return byName[0];

  return null;
}

function hasClearDefinition(raw: string | null | undefined): boolean {
  const definition = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!definition) return false;
  if (definition.length < 8) return false;

  const letters = (definition.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  const digits = (definition.match(/\d/g) ?? []).length;
  const wordsWithLetters = definition
    .split(/\s+/)
    .filter((part) => /[A-Za-zÀ-ÿ]/.test(part));

  if (letters < 6) return false;
  if (wordsWithLetters.length < 2) return false;
  if (digits > 0 && letters <= digits) return false;

  const compact = normalizeText(definition).replace(/[^a-z0-9]/g, "");
  if (!compact) return false;
  if (/^(.)\1+$/.test(compact)) return false;
  if (/^[a-z]{1,4}\d*$/.test(compact)) return false;

  return true;
}

function extractDefinitionCandidate(text: string): string | null {
  const explicit = text.match(
    /(?:definition|définition|objet|description|motif)\s*[:\-]\s*([^\n\r]{3,260})/i,
  )?.[1];
  if (explicit) return explicit.trim();

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/(facture|invoice|paiement|payment)/i.test(line)) continue;
    if (line.length >= 8) return line;
  }

  return lines[0] ?? null;
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
  invoicePrefix: InvoicePrefix | null;
} {
  const extractEmbedText = (embed: any): string => {
    const fieldText = Array.isArray(embed?.fields)
      ? embed.fields
          .map((field: any) => `${String(field?.name ?? "")} ${String(field?.value ?? "")}`.trim())
          .join(" ")
      : "";
    return [
      String(embed?.title ?? ""),
      String(embed?.description ?? ""),
      String(embed?.author?.name ?? ""),
      String(embed?.footer?.text ?? ""),
      fieldText,
    ]
      .filter(Boolean)
      .join(" ");
  };

  const embedText = Array.isArray(input.embeds)
    ? input.embeds.map((e: any) => extractEmbedText(e)).join(" ")
    : "";
  const text = `${input.content ?? ""} ${embedText}`.trim();
  const lower = text.toLowerCase();

  const revenueHints = [
    "facture client",
    "paiement reçu",
    "paiement recu",
    "encaissement",
    "a payé une facture",
    "a paye une facture",
    "facture",
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
    "paiement entreprise",
    "a payé avec le compte de l'entreprise",
    "a paye avec le compte de l'entreprise",
    "compte de l'entreprise",
    "carburant",
    "payment sent",
    "supplier",
  ];

  const isRevenue = revenueHints.some((hint) => lower.includes(hint));
  const isExpense = expenseHints.some((hint) => lower.includes(hint));

  const invoiceMatch = text.match(/(?:facture|invoice)\s*(?:#|n[o°])?\s*([a-zA-Z0-9-]{2,})/i);
  const amountMatch = text.match(/(-?\d[\d\s.,]*)\s*(€|eur|usd|\$|xaf|xof|cad|gbp)/i);
  const dueMatch = text.match(/(?:echeance|échéance|due date)\s*[:\-]?\s*([\d\/-]{8,10}|\d{4}-\d{2}-\d{2})/i);
  const paidMatch = text.match(/(?:date de paiement|paid on|payée le|payee le)\s*[:\-]?\s*([\d\/-]{8,10}|\d{4}-\d{2}-\d{2})/i);

  const explicitRevenue = /a\s+pay[ée]e?\s+une\s+facture|facture\s+pay[ée]e?/i.test(text);
  const explicitExpense = /paiement\s+entreprise|compte\s+de\s+l['’]entreprise|carburant|achat/i.test(text);

  const side = explicitRevenue && !explicitExpense
    ? "revenue"
    : explicitExpense && !explicitRevenue
      ? "expense"
      : isRevenue && !isExpense
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

  const clientNameMatch = text.match(/client\s*[\s\S]{0,60}?nom\s*:\s*([^\n\r]{2,120})/i);
  const supplierNameMatch = text.match(/(?:fournisseur|vendor|supplier)\s*[\s\S]{0,60}?nom\s*:\s*([^\n\r]{2,120})/i);
  const genericMatch = text.match(/(?:client|fournisseur|vendor|supplier)\s*[:\-]?\s*([^\n\r,;]{2,120})/i);
  const counterparty = cleanCounterparty(
    clientNameMatch?.[1]?.trim() ??
      supplierNameMatch?.[1]?.trim() ??
      genericMatch?.[1]?.trim() ??
      null,
  );

  const description = text.length > 0 ? text.slice(0, 600) : null;
  const definitionCandidate = extractDefinitionCandidate(text);
  const invoicePrefix = extractInvoicePrefix(invoiceMatch?.[1] ?? null, text);
  const invoiceNumber = isValidInvoiceToken(invoiceMatch?.[1] ?? null)
    ? String(invoiceMatch?.[1]).trim()
    : null;
  const isInvoice = Boolean(invoiceNumber);
  const hasDefinition = hasClearDefinition(definitionCandidate);

  const needsClassification =
    side === "unclassified" ||
    amount === null ||
    (isInvoice && !hasDefinition);
  const status = needsClassification ? "to_classify" : paymentDate ? "paid" : dueDate ? "pending" : "recorded";

  return {
    side,
    entryType,
    invoiceNumber,
    counterparty,
    description,
    amount,
    currency,
    operationDate,
    dueDate,
    status,
    paymentDate,
    needsClassification,
    invoicePrefix,
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
      .select("id, company_id, webhook_event_id, source, discord_message_id, entry_side, entry_type, invoice_number, counterparty, description, amount, currency, operation_date, due_date, payment_date, status, needs_classification, created_at, updated_at")
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

    const eventIds = (rows ?? [])
      .map((row: any) => row.webhook_event_id)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);

    let emitterMap = new Map<string, { author_name: string | null; occurred_at: string | null }>();
    if (eventIds.length > 0) {
      const { data: events, error: eventsError } = await context.supabase
        .from("accounting_webhook_events")
        .select("id, author_name, occurred_at")
        .in("id", eventIds);
      if (eventsError) throw new Error(eventsError.message);
      emitterMap = new Map(
        (events ?? []).map((event: any) => [
          String(event.id),
          {
            author_name: event.author_name ?? null,
            occurred_at: event.occurred_at ?? null,
          },
        ]),
      );
    }

    const companyMap = new Map<string, string>();
    for (const company of companies ?? []) companyMap.set(company.id, company.name);

    return (rows ?? []).map((row: any) => ({
      ...row,
      counterparty: cleanCounterparty(row.counterparty),
      emitter: emitterMap.get(String(row.webhook_event_id ?? ""))?.author_name ?? null,
      occurred_at: emitterMap.get(String(row.webhook_event_id ?? ""))?.occurred_at ?? null,
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

export const forceRefreshAccountingLast7Days = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const firmId = await requireActiveFirmId(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const botToken =
      process.env.DISCORD_BOT_TOKEN?.trim() ||
      process.env.DISCORD_TOKEN?.trim() ||
      process.env.BOT_TOKEN?.trim() ||
      "";

    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 7);

    const [{ data: events, error: eventsError }, { data: companies, error: companiesError }] = await Promise.all([
      supabaseAdmin
        .from("accounting_webhook_events")
        .select("id, company_id, discord_server_id, discord_channel_id, discord_message_id, occurred_at, author_name, content, embeds, attachments, raw_payload")
        .eq("firm_id", firmId)
        .eq("source", "discord")
        .gte("occurred_at", fromDate.toISOString())
        .order("occurred_at", { ascending: true }),
      supabaseAdmin
        .from("accounting_companies")
        .select("id, name, legal_name, company_type, internal_identifier, discord_server_id, discord_channel_id")
        .eq("firm_id", firmId)
        .eq("status", "active"),
    ]);

    if (eventsError) throw new Error(eventsError.message);
    if (companiesError) throw new Error(companiesError.message);

    const companyByDiscord = new Map<string, any>();
    for (const company of companies ?? []) {
      if (!company.discord_server_id || !company.discord_channel_id) continue;
      const key = `${company.discord_server_id}:${company.discord_channel_id}`;
      if (!companyByDiscord.has(key)) companyByDiscord.set(key, company);
    }

    let processed = 0;
    let anomalies = 0;
    let upserted = 0;
    let fetchedFromDiscord = 0;

    async function fetchChannelMessagesSince(channelId: string, sinceIso: string): Promise<any[]> {
      if (!botToken) return [];
      const sinceTs = new Date(sinceIso).getTime();
      if (Number.isNaN(sinceTs)) return [];

      const collected: any[] = [];
      let before: string | null = null;

      for (let page = 0; page < 10; page += 1) {
        const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
        url.searchParams.set("limit", "100");
        if (before) url.searchParams.set("before", before);

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bot ${botToken}`,
            "content-type": "application/json",
          },
        });

        if (!response.ok) break;
        const batch = (await response.json()) as any[];
        if (!Array.isArray(batch) || batch.length === 0) break;

        let reachedOlder = false;
        for (const message of batch) {
          const ts = new Date(message?.timestamp ?? 0).getTime();
          if (!Number.isFinite(ts) || ts < sinceTs) {
            reachedOlder = true;
            continue;
          }
          collected.push(message);
        }

        before = String(batch[batch.length - 1]?.id ?? "");
        if (!before || reachedOlder) break;
      }

      return collected;
    }

    if (botToken) {
      for (const company of companies ?? []) {
        if (!company.discord_server_id || !company.discord_channel_id) continue;
        const channelMessages = await fetchChannelMessagesSince(company.discord_channel_id, fromDate.toISOString());
        fetchedFromDiscord += channelMessages.length;

        for (const message of channelMessages) {
          await ingestAccountingDiscordWebhook({
            firm_id: firmId,
            server_id: company.discord_server_id,
            channel_id: company.discord_channel_id,
            message_id: String(message?.id ?? "") || null,
            date: typeof message?.timestamp === "string" ? message.timestamp : null,
            author:
              String(message?.author?.global_name ?? "") ||
              String(message?.author?.username ?? "") ||
              null,
            content: typeof message?.content === "string" ? message.content : null,
            embeds: Array.isArray(message?.embeds) ? message.embeds : [],
            attachments: Array.isArray(message?.attachments) ? message.attachments : [],
          });
        }
      }
    }

    const { data: refreshedEvents, error: refreshedEventsError } = await supabaseAdmin
      .from("accounting_webhook_events")
      .select("id, company_id, discord_server_id, discord_channel_id, discord_message_id, occurred_at, author_name, content, embeds, attachments, raw_payload")
      .eq("firm_id", firmId)
      .eq("source", "discord")
      .gte("occurred_at", fromDate.toISOString())
      .order("occurred_at", { ascending: true });

    if (refreshedEventsError) throw new Error(refreshedEventsError.message);

    for (const event of refreshedEvents ?? events ?? []) {
      processed += 1;
      const key = `${event.discord_server_id ?? ""}:${event.discord_channel_id ?? ""}`;
      const classification = classifyMessage({
        content: event.content ?? "",
        embeds: Array.isArray(event.embeds) ? event.embeds : [],
        occurredAt: event.occurred_at,
      });

      const resolvedFromEvent = event.company_id
        ? (companies ?? []).find((company) => company.id === event.company_id) ?? null
        : companyByDiscord.get(key) ?? null;
      const resolvedByPrefix = resolveCompanyFromPrefix(companies ?? [], classification.invoicePrefix);
      const resolvedHolding = resolveHoldingCompany(companies ?? []);
      const resolvedCompany = resolvedByPrefix ?? resolvedFromEvent ?? resolvedHolding;

      if (!resolvedCompany) {
        anomalies += 1;
        await supabaseAdmin
          .from("accounting_webhook_events")
          .update({
            company_id: null,
            processing_status: "anomaly",
            anomaly_reason: "company_not_found",
          })
          .eq("id", event.id)
          .eq("firm_id", firmId);
        continue;
      }

      const operationPayload: Record<string, unknown> = {
        firm_id: firmId,
        company_id: resolvedCompany.id,
        webhook_event_id: event.id,
        source: "discord",
        discord_message_id: event.discord_message_id ?? null,
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
        raw_payload: event.raw_payload ?? {},
      };

      const onConflict = "webhook_event_id";
      const { error: opError } = await supabaseAdmin
        .from("accounting_operations")
        .upsert(operationPayload, { onConflict });

      if (opError) throw new Error(opError.message);

      upserted += 1;

      const nextStatus = classification.needsClassification ? "anomaly" : "processed";
      const nextReason = classification.needsClassification ? "needs_manual_classification" : null;
      if (classification.needsClassification) anomalies += 1;

      await supabaseAdmin
        .from("accounting_webhook_events")
        .update({
          company_id: resolvedCompany.id,
          processing_status: nextStatus,
          anomaly_reason: nextReason,
        })
        .eq("id", event.id)
        .eq("firm_id", firmId);
    }

    return {
      processed,
      anomalies,
      upserted,
      fetched_from_discord: fetchedFromDiscord,
      discord_backfill_enabled: Boolean(botToken),
      from: fromDate.toISOString(),
      to: new Date().toISOString(),
    };
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
  id?: string | null;
  timestamp?: string | null;
  author_username?: string | null;
  author_name?: string | null;
  author_object?: { username?: string | null; global_name?: string | null } | null;
};

export async function ingestAccountingDiscordWebhook(rawPayload: AccountingDiscordWebhookPayload) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const payload = rawPayload ?? {};
  const explicitFirmId = payload.firm_id ?? null;
  const serverId = payload.server_id ?? payload.guild_id ?? null;
  const channelId = payload.channel_id ?? null;
  const messageId = payload.message_id ?? payload.id ?? null;
  const occurredAt = payload.date ?? payload.timestamp ?? new Date().toISOString();
  const author =
    (typeof payload.author === "string" ? payload.author : null) ??
    payload.author_name ??
    payload.author_username ??
    payload.author_object?.global_name ??
    payload.author_object?.username ??
    null;
  const content = payload.content ?? "";
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const classification = classifyMessage({
    content,
    embeds,
    occurredAt,
  });

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
  let matchedCompanies: any[] = [];
  if (serverId && channelId) {
    const { data: companyRows, error: companyError } = await supabaseAdmin
      .from("accounting_companies")
      .select("id, firm_id, name, legal_name, company_type, internal_identifier")
      .eq("discord_server_id", serverId)
      .eq("discord_channel_id", channelId)
      .eq("status", "active");

    if (companyError) throw new Error(companyError.message);
    matchedCompanies = companyRows ?? [];
    companyMatchCount = matchedCompanies.length;

    if (companyMatchCount === 1) {
      company = matchedCompanies[0] ?? null;
    } else if (companyMatchCount > 1) {
      company =
        resolveCompanyFromPrefix(matchedCompanies, classification.invoicePrefix) ??
        resolveHoldingCompany(matchedCompanies);
    }
  }

  const inferredFirmId =
    matchedCompanies.length > 0 && matchedCompanies.every((row) => row.firm_id === matchedCompanies[0]?.firm_id)
      ? matchedCompanies[0]?.firm_id
      : null;

  const firmId = explicitFirmId ?? company?.firm_id ?? inferredFirmId ?? null;

  let firmCompanies: any[] = [];
  if (firmId) {
    const { data: activeCompanies, error: activeCompaniesError } = await supabaseAdmin
      .from("accounting_companies")
      .select("id, firm_id, name, legal_name, company_type, internal_identifier")
      .eq("firm_id", firmId)
      .eq("status", "active");
    if (activeCompaniesError) throw new Error(activeCompaniesError.message);
    firmCompanies = activeCompanies ?? [];

    const byPrefix = resolveCompanyFromPrefix(firmCompanies, classification.invoicePrefix);
    const holdingFallback = resolveHoldingCompany(firmCompanies);
    company = byPrefix ?? company ?? holdingFallback;
  }

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

  const anomalyReason = !company
    ? companyMatchCount > 1
      ? classification.invoicePrefix
        ? "prefix_company_not_resolved"
        : "multiple_companies_match"
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
    .upsert(opPayload, { onConflict: "webhook_event_id" })
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
