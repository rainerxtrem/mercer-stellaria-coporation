import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { withActorNames } from "@/lib/activity-log";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "text/plain",
]);

const MAX_SIZE = 50 * 1024 * 1024;

async function myClientRow(context: { supabase: any; userId: string }) {
  const { data: isClient } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "client",
  });
  if (!isClient) throw new Error("Acces reserve au portail client.");

  const { data, error } = await context.supabase
    .from("clients")
    .select("id, first_name, last_name, email, phone, address, company, job_title, discord_webhook_url, firm_id")
    .eq("profile_id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Aucun dossier client n'est associé à votre compte.");
  return data;
}

async function signedUpload(context: { supabase: any }, path: string) {
  const { data, error } = await context.supabase.storage.from("bar-media").createSignedUploadUrl(path);
  if (error) throw new Error(error.message);
  return data;
}

async function fetchClaim(context: { supabase: any }, claimId: string) {
  const { data, error } = await context.supabase
    .from("insurance_claims")
    .select(
      "id, firm_id, client_id, matter_id, number, subject, description, incident_date, incident_location, incident_type, estimated_amount, currency, status, staff_notes, rejection_reason, handled_by, handled_at, closed_at, created_at, updated_at, clients(first_name, last_name, company), matters(number, title)",
    )
    .eq("id", claimId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Sinistre introuvable.");
  return data;
}

async function fetchRefund(context: { supabase: any }, refundId: string) {
  const { data, error } = await context.supabase
    .from("refund_requests")
    .select(
      "id, firm_id, client_id, matter_id, number, subject, description, purchase_date, vendor_name, invoice_reference, amount, currency, status, staff_notes, rejection_reason, handled_by, handled_at, closed_at, created_at, updated_at, clients(first_name, last_name, company), matters(number, title)",
    )
    .eq("id", refundId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Demande introuvable.");
  return data;
}

async function listClientPortalModules(context: { supabase: any; userId: string }) {
  const client = await myClientRow(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("enterprise_modules")
    .select("module_slug, enabled")
    .eq("firm_id", client.firm_id)
    .eq("enabled", true);
  return {
    firm_id: client.firm_id,
    modules: (data ?? []).map((row: any) => row.module_slug as string),
  };
}

function requestStatusLabel(status: string) {
  switch (status) {
    case "in_progress":
      return "En cours";
    case "accepted":
      return "Acceptée";
    case "rejected":
      return "Refusée";
    case "closed":
      return "Clôturée";
    default:
      return "Nouvelle";
  }
}

async function listClaimMessages(context: { supabase: any; userId: string }, claimId: string) {
  const { data, error } = await context.supabase
    .from("insurance_claim_messages")
    .select("id, claim_id, author_id, body, created_at")
    .eq("claim_id", claimId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return withActorNames(context.supabase, data ?? [], { author_id: "author_name" });
}

async function listRefundMessages(context: { supabase: any; userId: string }, refundId: string) {
  const { data, error } = await context.supabase
    .from("refund_request_messages")
    .select("id, refund_id, author_id, body, created_at")
    .eq("refund_id", refundId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return withActorNames(context.supabase, data ?? [], { author_id: "author_name" });
}

// ============ CLIENT PORTAL MODULES ============
export const listClientInsuranceModules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listClientPortalModules(context));

export const listClientInsuranceClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await myClientRow(context);
    const { data, error } = await context.supabase
      .from("insurance_claims")
      .select(
        "id, firm_id, client_id, matter_id, number, subject, description, incident_date, incident_location, incident_type, estimated_amount, currency, status, staff_notes, rejection_reason, handled_by, handled_at, closed_at, created_at, updated_at, clients(first_name, last_name, company), matters(number, title)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({ ...row, status_label: requestStatusLabel(row.status) }));
  });

export const getClientInsuranceClaim = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { claim_id: string }) => ({ claim_id: z.string().uuid().parse(data.claim_id) }))
  .handler(async ({ data, context }) => {
    await myClientRow(context);
    const claim = await fetchClaim(context, data.claim_id);
    const [messages, attachments] = await Promise.all([
      listClaimMessages(context, data.claim_id),
      context.supabase
        .from("insurance_claim_attachments")
        .select("id, filename, mime_type, size_bytes, created_at, uploaded_by_client")
        .eq("claim_id", data.claim_id)
        .order("created_at", { ascending: false }),
    ]);
    if ((attachments as any).error) throw new Error((attachments as any).error.message);
    return {
      claim: { ...claim, status_label: requestStatusLabel((claim as any).status) },
      messages,
      attachments: (attachments as any).data ?? [],
    };
  });

export const createClientInsuranceClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    subject: string;
    description: string;
    incident_date?: string | null;
    incident_location?: string | null;
    incident_type?: string | null;
    estimated_amount?: number | null;
    currency?: string | null;
    matter_id?: string | null;
  }) => ({
    subject: z.string().trim().min(3).max(180).parse(data.subject),
    description: z.string().trim().min(10).max(6000).parse(data.description),
    incident_date: z.string().nullable().optional().parse(data.incident_date ?? null),
    incident_location: z.string().trim().max(180).nullable().optional().parse(data.incident_location ?? null),
    incident_type: z.string().trim().max(120).nullable().optional().parse(data.incident_type ?? null),
    estimated_amount: z.number().nonnegative().nullable().optional().parse(data.estimated_amount ?? null),
    currency: z.string().trim().max(8).nullable().optional().parse(data.currency ?? "EUR"),
    matter_id: z.string().uuid().nullable().optional().parse(data.matter_id ?? null),
  }))
  .handler(async ({ data, context }) => {
    const client = await myClientRow(context);
    const { data: created, error } = await context.supabase
      .from("insurance_claims")
      .insert({
        firm_id: client.firm_id,
        client_id: client.id,
        matter_id: data.matter_id,
        subject: data.subject,
        description: data.description,
        incident_date: data.incident_date,
        incident_location: data.incident_location,
        incident_type: data.incident_type,
        estimated_amount: data.estimated_amount,
        currency: data.currency ?? "EUR",
        created_by: context.userId,
      })
      .select("id, number")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const createClientInsuranceClaimUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { claim_id: string; filename: string; mime_type: string; size_bytes: number }) => ({
    claim_id: z.string().uuid().parse(data.claim_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    if (data.size_bytes > MAX_SIZE) throw new Error("Fichier trop volumineux (50 Mo maximum).");
    if (!ALLOWED_MIME.has(data.mime_type)) throw new Error("Type de fichier non autorisé.");
    await fetchClaim(context, data.claim_id);
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `claims/${data.claim_id}/${crypto.randomUUID()}-${safeName}`;
    const signed = await signedUpload(context, path);
    return { path, token: signed.token, signed_url: signed.signedUrl };
  });

export const finalizeClientInsuranceClaimAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    claim_id: string;
    filename: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
  }) => ({
    claim_id: z.string().uuid().parse(data.claim_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    storage_path: z.string().trim().max(600).parse(data.storage_path),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    await fetchClaim(context, data.claim_id);
    const { error } = await context.supabase.from("insurance_claim_attachments").insert({
      claim_id: data.claim_id,
      filename: data.filename,
      storage_path: data.storage_path,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      uploaded_by: context.userId,
      uploaded_by_client: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getClientInsuranceClaimAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { attachment_id: string }) => ({ attachment_id: z.string().uuid().parse(data.attachment_id) }))
  .handler(async ({ data, context }) => {
    await myClientRow(context);
    const { data: row, error } = await context.supabase
      .from("insurance_claim_attachments")
      .select("storage_path, filename")
      .eq("id", data.attachment_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.storage_path) throw new Error("Pièce jointe inaccessible.");
    const { data: signed, error: signedError } = await context.supabase.storage
      .from("bar-media")
      .createSignedUrl(row.storage_path, 300, { download: row.filename ?? "document" });
    if (signedError) throw new Error(signedError.message);
    return { url: signed.signedUrl, filename: row.filename };
  });

export const sendClientInsuranceClaimMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { claim_id: string; body: string }) => ({
    claim_id: z.string().uuid().parse(data.claim_id),
    body: z.string().trim().min(1).max(5000).parse(data.body),
  }))
  .handler(async ({ data, context }) => {
    const claim = await fetchClaim(context, data.claim_id);
    const { data: created, error } = await context.supabase.from("insurance_claim_messages").insert({
      claim_id: data.claim_id,
      author_id: context.userId,
      body: data.body,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id, claim_id: claim.id };
  });

export const listClientRefundRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await myClientRow(context);
    const { data, error } = await context.supabase
      .from("refund_requests")
      .select(
        "id, firm_id, client_id, matter_id, number, subject, description, purchase_date, vendor_name, invoice_reference, amount, currency, status, staff_notes, rejection_reason, handled_by, handled_at, closed_at, created_at, updated_at, clients(first_name, last_name, company), matters(number, title)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({ ...row, status_label: requestStatusLabel(row.status) }));
  });

export const getClientRefundRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { refund_id: string }) => ({ refund_id: z.string().uuid().parse(data.refund_id) }))
  .handler(async ({ data, context }) => {
    await myClientRow(context);
    const refund = await fetchRefund(context, data.refund_id);
    const [messages, attachments] = await Promise.all([
      listRefundMessages(context, data.refund_id),
      context.supabase
        .from("refund_request_attachments")
        .select("id, filename, mime_type, size_bytes, created_at, uploaded_by_client")
        .eq("refund_id", data.refund_id)
        .order("created_at", { ascending: false }),
    ]);
    if ((attachments as any).error) throw new Error((attachments as any).error.message);
    return {
      refund: { ...refund, status_label: requestStatusLabel((refund as any).status) },
      messages,
      attachments: (attachments as any).data ?? [],
    };
  });

export const createClientRefundRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    subject: string;
    description: string;
    amount: number;
    purchase_date?: string | null;
    vendor_name?: string | null;
    invoice_reference?: string | null;
    currency?: string | null;
    matter_id?: string | null;
  }) => ({
    subject: z.string().trim().min(3).max(180).parse(data.subject),
    description: z.string().trim().min(10).max(6000).parse(data.description),
    amount: z.number().positive().parse(data.amount),
    purchase_date: z.string().nullable().optional().parse(data.purchase_date ?? null),
    vendor_name: z.string().trim().max(180).nullable().optional().parse(data.vendor_name ?? null),
    invoice_reference: z.string().trim().max(120).nullable().optional().parse(data.invoice_reference ?? null),
    currency: z.string().trim().max(8).nullable().optional().parse(data.currency ?? "EUR"),
    matter_id: z.string().uuid().nullable().optional().parse(data.matter_id ?? null),
  }))
  .handler(async ({ data, context }) => {
    const client = await myClientRow(context);
    const { data: created, error } = await context.supabase
      .from("refund_requests")
      .insert({
        firm_id: client.firm_id,
        client_id: client.id,
        matter_id: data.matter_id,
        subject: data.subject,
        description: data.description,
        amount: data.amount,
        purchase_date: data.purchase_date,
        vendor_name: data.vendor_name,
        invoice_reference: data.invoice_reference,
        currency: data.currency ?? "EUR",
        created_by: context.userId,
      })
      .select("id, number")
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const createClientRefundRequestUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { refund_id: string; filename: string; mime_type: string; size_bytes: number }) => ({
    refund_id: z.string().uuid().parse(data.refund_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    if (data.size_bytes > MAX_SIZE) throw new Error("Fichier trop volumineux (50 Mo maximum).");
    if (!ALLOWED_MIME.has(data.mime_type)) throw new Error("Type de fichier non autorisé.");
    await fetchRefund(context, data.refund_id);
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `refunds/${data.refund_id}/${crypto.randomUUID()}-${safeName}`;
    const signed = await signedUpload(context, path);
    return { path, token: signed.token, signed_url: signed.signedUrl };
  });

export const finalizeClientRefundRequestAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    refund_id: string;
    filename: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
  }) => ({
    refund_id: z.string().uuid().parse(data.refund_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    storage_path: z.string().trim().max(600).parse(data.storage_path),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    await fetchRefund(context, data.refund_id);
    const { error } = await context.supabase.from("refund_request_attachments").insert({
      refund_id: data.refund_id,
      filename: data.filename,
      storage_path: data.storage_path,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      uploaded_by: context.userId,
      uploaded_by_client: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getClientInsuranceRefundAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { attachment_id: string }) => ({ attachment_id: z.string().uuid().parse(data.attachment_id) }))
  .handler(async ({ data, context }) => {
    await myClientRow(context);
    const { data: row, error } = await context.supabase
      .from("refund_request_attachments")
      .select("storage_path, filename")
      .eq("id", data.attachment_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.storage_path) throw new Error("Pièce jointe inaccessible.");
    const { data: signed, error: signedError } = await context.supabase.storage
      .from("bar-media")
      .createSignedUrl(row.storage_path, 300, { download: row.filename ?? "document" });
    if (signedError) throw new Error(signedError.message);
    return { url: signed.signedUrl, filename: row.filename };
  });

export const sendClientRefundRequestMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { refund_id: string; body: string }) => ({
    refund_id: z.string().uuid().parse(data.refund_id),
    body: z.string().trim().min(1).max(5000).parse(data.body),
  }))
  .handler(async ({ data, context }) => {
    const refund = await fetchRefund(context, data.refund_id);
    const { data: created, error } = await context.supabase.from("refund_request_messages").insert({
      refund_id: data.refund_id,
      author_id: context.userId,
      body: data.body,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id, refund_id: refund.id };
  });

// ============ STAFF MODULES ============
export const listInsuranceClaims = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("insurance_claims")
      .select(
        "id, firm_id, client_id, matter_id, number, subject, description, incident_date, incident_location, incident_type, estimated_amount, currency, status, staff_notes, rejection_reason, handled_by, handled_at, closed_at, created_at, updated_at, clients(first_name, last_name, company), matters(number, title)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({ ...row, status_label: requestStatusLabel(row.status) }));
  });

export const getInsuranceClaim = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { claim_id: string }) => ({ claim_id: z.string().uuid().parse(data.claim_id) }))
  .handler(async ({ data, context }) => {
    const claim = await fetchClaim(context, data.claim_id);
    const [messages, attachments] = await Promise.all([
      listClaimMessages(context, data.claim_id),
      context.supabase
        .from("insurance_claim_attachments")
        .select("id, filename, mime_type, size_bytes, created_at, uploaded_by_client")
        .eq("claim_id", data.claim_id)
        .order("created_at", { ascending: false }),
    ]);
    if ((attachments as any).error) throw new Error((attachments as any).error.message);
    return {
      claim: { ...claim, status_label: requestStatusLabel((claim as any).status) },
      messages,
      attachments: (attachments as any).data ?? [],
    };
  });

export const getInsuranceClaimAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { attachment_id: string }) => ({ attachment_id: z.string().uuid().parse(data.attachment_id) }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("insurance_claim_attachments")
      .select("storage_path, filename")
      .eq("id", data.attachment_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.storage_path) throw new Error("Pièce jointe inaccessible.");
    const { data: signed, error: signedError } = await context.supabase.storage
      .from("bar-media")
      .createSignedUrl(row.storage_path, 300, { download: row.filename ?? "document" });
    if (signedError) throw new Error(signedError.message);
    return { url: signed.signedUrl, filename: row.filename };
  });

export const updateInsuranceClaimStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    claim_id: string;
    status: "new" | "in_progress" | "accepted" | "rejected" | "closed";
    staff_notes?: string | null;
    rejection_reason?: string | null;
  }) => ({
    claim_id: z.string().uuid().parse(data.claim_id),
    status: z.enum(["new", "in_progress", "accepted", "rejected", "closed"]).parse(data.status),
    staff_notes: z.string().trim().max(6000).nullable().optional().parse(data.staff_notes ?? null),
    rejection_reason: z.string().trim().max(2000).nullable().optional().parse(data.rejection_reason ?? null),
  }))
  .handler(async ({ data, context }) => {
    const claim = await fetchClaim(context, data.claim_id);
    const update: Record<string, unknown> = {
      status: data.status,
      staff_notes: data.staff_notes,
      rejection_reason: data.rejection_reason,
      handled_by: context.userId,
      handled_at: new Date().toISOString(),
      closed_at: data.status === "closed" ? new Date().toISOString() : null,
    };
    const { error } = await context.supabase.from("insurance_claims").update(update).eq("id", claim.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createInsuranceClaimAttachmentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { claim_id: string; filename: string; mime_type: string; size_bytes: number }) => ({
    claim_id: z.string().uuid().parse(data.claim_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    if (data.size_bytes > MAX_SIZE) throw new Error("Fichier trop volumineux (50 Mo maximum).");
    if (!ALLOWED_MIME.has(data.mime_type)) throw new Error("Type de fichier non autorisé.");
    await fetchClaim(context, data.claim_id);
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `claims/${data.claim_id}/${crypto.randomUUID()}-${safeName}`;
    const signed = await signedUpload(context, path);
    return { path, token: signed.token, signed_url: signed.signedUrl };
  });

export const finalizeInsuranceClaimAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    claim_id: string;
    filename: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    uploaded_by_client?: boolean;
  }) => ({
    claim_id: z.string().uuid().parse(data.claim_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    storage_path: z.string().trim().max(600).parse(data.storage_path),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
    uploaded_by_client: z.boolean().optional().parse(data.uploaded_by_client ?? false),
  }))
  .handler(async ({ data, context }) => {
    await fetchClaim(context, data.claim_id);
    const { error } = await context.supabase.from("insurance_claim_attachments").insert({
      claim_id: data.claim_id,
      filename: data.filename,
      storage_path: data.storage_path,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      uploaded_by: context.userId,
      uploaded_by_client: data.uploaded_by_client ?? false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendInsuranceClaimMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { claim_id: string; body: string }) => ({
    claim_id: z.string().uuid().parse(data.claim_id),
    body: z.string().trim().min(1).max(5000).parse(data.body),
  }))
  .handler(async ({ data, context }) => {
    const claim = await fetchClaim(context, data.claim_id);
    const { data: created, error } = await context.supabase.from("insurance_claim_messages").insert({
      claim_id: data.claim_id,
      author_id: context.userId,
      body: data.body,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id, claim_id: claim.id };
  });

export const listInsuranceRefundRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("refund_requests")
      .select(
        "id, firm_id, client_id, matter_id, number, subject, description, purchase_date, vendor_name, invoice_reference, amount, currency, status, staff_notes, rejection_reason, handled_by, handled_at, closed_at, created_at, updated_at, clients(first_name, last_name, company), matters(number, title)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: any) => ({ ...row, status_label: requestStatusLabel(row.status) }));
  });

export const getInsuranceRefundRequest = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { refund_id: string }) => ({ refund_id: z.string().uuid().parse(data.refund_id) }))
  .handler(async ({ data, context }) => {
    const refund = await fetchRefund(context, data.refund_id);
    const [messages, attachments] = await Promise.all([
      listRefundMessages(context, data.refund_id),
      context.supabase
        .from("refund_request_attachments")
        .select("id, filename, mime_type, size_bytes, created_at, uploaded_by_client")
        .eq("refund_id", data.refund_id)
        .order("created_at", { ascending: false }),
    ]);
    if ((attachments as any).error) throw new Error((attachments as any).error.message);
    return {
      refund: { ...refund, status_label: requestStatusLabel((refund as any).status) },
      messages,
      attachments: (attachments as any).data ?? [],
    };
  });

export const getInsuranceRefundAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { attachment_id: string }) => ({ attachment_id: z.string().uuid().parse(data.attachment_id) }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("refund_request_attachments")
      .select("storage_path, filename")
      .eq("id", data.attachment_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.storage_path) throw new Error("Pièce jointe inaccessible.");
    const { data: signed, error: signedError } = await context.supabase.storage
      .from("bar-media")
      .createSignedUrl(row.storage_path, 300, { download: row.filename ?? "document" });
    if (signedError) throw new Error(signedError.message);
    return { url: signed.signedUrl, filename: row.filename };
  });

export const updateInsuranceRefundRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    refund_id: string;
    status: "new" | "in_progress" | "accepted" | "rejected" | "closed";
    staff_notes?: string | null;
    rejection_reason?: string | null;
  }) => ({
    refund_id: z.string().uuid().parse(data.refund_id),
    status: z.enum(["new", "in_progress", "accepted", "rejected", "closed"]).parse(data.status),
    staff_notes: z.string().trim().max(6000).nullable().optional().parse(data.staff_notes ?? null),
    rejection_reason: z.string().trim().max(2000).nullable().optional().parse(data.rejection_reason ?? null),
  }))
  .handler(async ({ data, context }) => {
    const refund = await fetchRefund(context, data.refund_id);
    const update: Record<string, unknown> = {
      status: data.status,
      staff_notes: data.staff_notes,
      rejection_reason: data.rejection_reason,
      handled_by: context.userId,
      handled_at: new Date().toISOString(),
      closed_at: data.status === "closed" ? new Date().toISOString() : null,
    };
    const { error } = await context.supabase.from("refund_requests").update(update).eq("id", refund.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createInsuranceRefundAttachmentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { refund_id: string; filename: string; mime_type: string; size_bytes: number }) => ({
    refund_id: z.string().uuid().parse(data.refund_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
  }))
  .handler(async ({ data, context }) => {
    if (data.size_bytes > MAX_SIZE) throw new Error("Fichier trop volumineux (50 Mo maximum).");
    if (!ALLOWED_MIME.has(data.mime_type)) throw new Error("Type de fichier non autorisé.");
    await fetchRefund(context, data.refund_id);
    const safeName = data.filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
    const path = `refunds/${data.refund_id}/${crypto.randomUUID()}-${safeName}`;
    const signed = await signedUpload(context, path);
    return { path, token: signed.token, signed_url: signed.signedUrl };
  });

export const finalizeInsuranceRefundAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    refund_id: string;
    filename: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
    uploaded_by_client?: boolean;
  }) => ({
    refund_id: z.string().uuid().parse(data.refund_id),
    filename: z.string().trim().min(1).max(255).parse(data.filename),
    storage_path: z.string().trim().max(600).parse(data.storage_path),
    mime_type: z.string().max(120).parse(data.mime_type),
    size_bytes: z.number().int().nonnegative().parse(data.size_bytes),
    uploaded_by_client: z.boolean().optional().parse(data.uploaded_by_client ?? false),
  }))
  .handler(async ({ data, context }) => {
    await fetchRefund(context, data.refund_id);
    const { error } = await context.supabase.from("refund_request_attachments").insert({
      refund_id: data.refund_id,
      filename: data.filename,
      storage_path: data.storage_path,
      mime_type: data.mime_type,
      size_bytes: data.size_bytes,
      uploaded_by: context.userId,
      uploaded_by_client: data.uploaded_by_client ?? false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendInsuranceRefundMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { refund_id: string; body: string }) => ({
    refund_id: z.string().uuid().parse(data.refund_id),
    body: z.string().trim().min(1).max(5000).parse(data.body),
  }))
  .handler(async ({ data, context }) => {
    const refund = await fetchRefund(context, data.refund_id);
    const { data: created, error } = await context.supabase.from("refund_request_messages").insert({
      refund_id: data.refund_id,
      author_id: context.userId,
      body: data.body,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: created.id, refund_id: refund.id };
  });