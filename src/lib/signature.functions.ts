import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { publicDoc } from "@/lib/signature-utils";

const placementSchema = z.object({
  page: z.number().int().min(1).max(50),
  x: z.number().min(0).max(2000),
  y: z.number().min(0).max(2000),
  width: z.number().min(30).max(500),
  height: z.number().min(15).max(300),
});

function publicMatterDocument(doc: any) {
  return {
    id: doc?.id as string,
    number: doc?.filename as string,
    kind: "matter_document" as const,
    status: "pending_signature" as const,
    issue_date: doc?.created_at as string,
    due_date: null,
    total: 0,
    currency: "",
    owner_name: doc?.owner_name ?? "Avocat",
    client_name: null,
    matter_number: doc?.matter_number ?? null,
  };
}

async function fetchSignatureLinkByToken(supabaseAdmin: any, token: string) {
  const { data: link, error } = await supabaseAdmin
    .from("signature_links")
    .select("id, token, created_by, expires_at, max_opens, opens_count, pin_hash, active, invalidate_on_sign, revoked_at, first_opened_at, signed_at, created_at, updated_at, invoice_id, matter_document_id, group_token, signer_index, signers_total")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return link as any;
}

async function hydrateLinkTarget(supabaseAdmin: any, link: any) {
  if (link.invoice_id) {
    const { data: inv, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("*, matters(id,number,title)")
      .eq("id", link.invoice_id)
      .maybeSingle();
    if (invErr) throw new Error(invErr.message);
    if (!inv) throw new Error("Document introuvable.");
    return { invoice: inv as any, matterDocument: null };
  }

  if (link.matter_document_id) {
    const { data: doc, error: docErr } = await supabaseAdmin
      .from("matter_documents")
      .select("id, matter_id, filename, storage_path, mime_type, size_bytes, version, uploaded_by, created_at")
      .eq("id", link.matter_document_id)
      .maybeSingle();
    if (docErr) throw new Error(docErr.message);
    if (!doc) throw new Error("Document introuvable.");

    const { data: matter, error: matterErr } = await supabaseAdmin
      .from("matters")
      .select("id, number, owner_id")
      .eq("id", doc.matter_id)
      .maybeSingle();
    if (matterErr) throw new Error(matterErr.message);
    if (!matter) throw new Error("Dossier introuvable.");

    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", matter.owner_id)
      .maybeSingle();

    return {
      invoice: null,
      matterDocument: {
        ...doc,
        matter_number: matter.number,
        owner_id: matter.owner_id,
        owner_name: owner?.full_name ?? "Avocat",
      },
    };
  }

  throw new Error("Lien de signature invalide (cible manquante).");
}

function detectImageKind(bytes: Uint8Array): "jpeg" | "png" | "unknown" {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) {
    return "png";
  }
  return "unknown";
}

// ============ AVOCAT : liste des liens + historique ============
export const listSignatureState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string }) => ({ invoice_id: z.string().uuid().parse(d.invoice_id) }))
  .handler(async ({ data, context }) => {
    const [{ data: links }, { data: signatures }, { data: events }] = await Promise.all([
      context.supabase
        .from("signature_links")
        .select("*")
        .eq("invoice_id", data.invoice_id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("document_signatures")
        .select("*")
        .eq("invoice_id", data.invoice_id)
        .order("signed_at", { ascending: false }),
      context.supabase
        .from("signature_events")
        .select("*")
        .eq("invoice_id", data.invoice_id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return {
      links: (links ?? []).map((l: any) => ({ ...l, pin_hash: l.pin_hash ? true : false })),
      signatures: signatures ?? [],
      events: events ?? [],
    };
  });

// ============ AVOCAT : création d'un lien sécurisé ============
export const createSignatureLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    invoice_id: string;
    expires_in_days?: number | null;
    max_opens?: number | null;
    pin?: string | null;
    invalidate_on_sign?: boolean;
  }) => ({
    invoice_id: z.string().uuid().parse(d.invoice_id),
    expires_in_days: z.number().int().min(1).max(365).nullable().optional().parse(d.expires_in_days ?? null),
    max_opens: z.number().int().min(1).max(100).nullable().optional().parse(d.max_opens ?? null),
    pin: z.string().trim().regex(/^\d{4,8}$/).nullable().optional().parse(d.pin || null),
    invalidate_on_sign: z.boolean().optional().parse(d.invalidate_on_sign ?? true),
  }))
  .handler(async ({ data, context }) => {
    const { generateToken, sha256Hex } = await import("@/lib/signature-utils");

    const { data: inv, error: invErr } = await context.supabase
      .from("invoices")
      .select("id, number, kind, status, matter_id")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (invErr || !inv) throw new Error("Document introuvable");
    if (["cancelled", "converted"].includes(inv.status)) {
      throw new Error("Ce document ne peut plus être envoyé à la signature.");
    }

    const token = generateToken();
    const expires_at = data.expires_in_days
      ? new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString()
      : null;

    const { data: link, error } = await context.supabase
      .from("signature_links")
      .insert({
        invoice_id: data.invoice_id,
        token,
        created_by: context.userId,
        expires_at,
        max_opens: data.max_opens,
        pin_hash: data.pin ? await sha256Hex(data.pin) : null,
        invalidate_on_sign: data.invalidate_on_sign ?? true,
      })
      .select("id, token, expires_at, max_opens, invalidate_on_sign, created_at")
      .single();
    if (error) throw new Error(error.message);

    const { data: persisted, error: persistedErr } = await context.supabase
      .from("signature_links")
      .select("id, token")
      .eq("id", link.id)
      .maybeSingle();
    if (persistedErr || !persisted?.token) {
      throw new Error(persistedErr?.message ?? "Le lien de signature n'a pas pu être persisté.");
    }

    const { data: prof } = await context.supabase
      .from("profiles").select("full_name").eq("id", context.userId).maybeSingle();

    await context.supabase.from("signature_events").insert({
      link_id: link.id,
      invoice_id: data.invoice_id,
      type: "link_created",
      actor_id: context.userId,
      actor_label: prof?.full_name ?? "Avocat",
      metadata: { expires_at, max_opens: data.max_opens, pin: Boolean(data.pin) },
    });

    if (inv.status === "draft") {
      await context.supabase.from("invoices").update({ status: "sent" }).eq("id", data.invoice_id);
    }

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase, context.userId, inv.matter_id,
      "signature_link_created",
      `Lien de signature émis pour ${inv.kind === "quote" ? "le devis" : "la facture"} ${inv.number ?? ""}`.trim(),
      { entity_type: "invoice", entity_id: data.invoice_id },
    );

    return link;
  });

export const createMatterDocumentSignatureLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    document_id: string;
    origin: string;
    signers_count?: number;
    expires_in_days?: number | null;
    max_opens?: number | null;
    pin?: string | null;
    invalidate_on_sign?: boolean;
  }) => ({
    document_id: z.string().uuid().parse(d.document_id),
    origin: z.string().url().parse(d.origin),
    signers_count: z.number().int().min(1).max(25).optional().parse(d.signers_count ?? 1),
    expires_in_days: z.number().int().min(1).max(365).nullable().optional().parse(d.expires_in_days ?? 7),
    max_opens: z.number().int().min(1).max(100).nullable().optional().parse(d.max_opens ?? null),
    pin: z.string().trim().regex(/^\d{4,8}$/).nullable().optional().parse(d.pin || null),
    invalidate_on_sign: z.boolean().optional().parse(d.invalidate_on_sign ?? true),
  }))
  .handler(async ({ data, context }) => {
    const { generateToken, sha256Hex } = await import("@/lib/signature-utils");

    const { data: doc, error: docErr } = await context.supabase
      .from("matter_documents")
      .select("id, filename, mime_type, matter_id")
      .eq("id", data.document_id)
      .maybeSingle();
    if (docErr || !doc) throw new Error("Document introuvable ou non accessible.");

    const signersCount = Math.max(1, Math.min(25, Number(data.signers_count ?? 1)));
    const groupToken = crypto.randomUUID();
    const expires_at = data.expires_in_days
      ? new Date(Date.now() + data.expires_in_days * 86_400_000).toISOString()
      : null;

    const rows = await Promise.all(
      Array.from({ length: signersCount }, async (_v, idx) => ({
        invoice_id: null,
        matter_document_id: data.document_id,
        token: generateToken(),
        created_by: context.userId,
        expires_at,
        max_opens: data.max_opens,
        pin_hash: data.pin ? await sha256Hex(data.pin) : null,
        invalidate_on_sign: data.invalidate_on_sign ?? true,
        group_token: groupToken,
        signer_index: idx + 1,
        signers_total: signersCount,
      })),
    );

    const { data: createdLinks, error } = await context.supabase
      .from("signature_links")
      .insert(rows as any)
      .select("id, token, expires_at, max_opens, invalidate_on_sign, created_at, signer_index, signers_total, group_token")
      .order("signer_index", { ascending: true });
    if (error) throw new Error(error.message);

    if (!createdLinks || createdLinks.length !== signersCount) {
      throw new Error("Le lot de liens de signature n'a pas pu être persisté.");
    }

    const links = (createdLinks as any[])
      .slice()
      .sort((a, b) => Number(a.signer_index ?? 0) - Number(b.signer_index ?? 0));

    const { data: prof } = await context.supabase
      .from("profiles").select("full_name").eq("id", context.userId).maybeSingle();

    await context.supabase.from("signature_events").insert(
      links.map((link: any) => ({
        link_id: link.id,
        invoice_id: null,
        matter_document_id: data.document_id,
        type: "link_created",
        actor_id: context.userId,
        actor_label: prof?.full_name ?? "Avocat",
        metadata: {
          expires_at,
          max_opens: data.max_opens,
          pin: Boolean(data.pin),
          signer_index: link.signer_index,
          signers_total: signersCount,
          group_token: groupToken,
        },
      })) as any,
    );

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase, context.userId, doc.matter_id,
      "signature_link_created",
      signersCount > 1
        ? `${signersCount} liens de signature émis pour le document ${doc.filename}`
        : `Lien de signature émis pour le document ${doc.filename}`,
      { entity_type: "document", entity_id: data.document_id },
    );

    return {
      group_token: groupToken,
      signers_total: signersCount,
      links: links.map((link: any) => ({
        ...link,
        url: `${data.origin}/signature/${link.token}`,
      })),
    };
  });

export const listMatterDocumentSignatureLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { document_id: string; origin: string }) => ({
    document_id: z.string().uuid().parse(d.document_id),
    origin: z.string().url().parse(d.origin),
  }))
  .handler(async ({ data, context }) => {
    const [{ data: links, error: linksErr }, { data: signatures, error: sigErr }] = await Promise.all([
      context.supabase
        .from("signature_links")
        .select("id, token, created_at, active, revoked_at, signed_at, expires_at, max_opens, opens_count, signer_index, signers_total, group_token")
        .eq("matter_document_id", data.document_id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("document_signatures")
        .select("id, link_id, signed_at")
        .eq("matter_document_id", data.document_id),
    ]);
    if (linksErr) throw new Error(linksErr.message);
    if (sigErr) throw new Error(sigErr.message);

    const signedByLinkId = new Map<string, string>();
    for (const sig of signatures ?? []) {
      if (!sig?.link_id) continue;
      signedByLinkId.set(String(sig.link_id), String(sig.signed_at ?? ""));
    }

    type Batch = {
      group_token: string;
      signers_total: number;
      created_at: string;
      links: any[];
    };

    const batches = new Map<string, Batch>();
    for (const raw of links ?? []) {
      const l: any = raw;
      const groupToken = String(l.group_token ?? l.id);
      if (!batches.has(groupToken)) {
        batches.set(groupToken, {
          group_token: groupToken,
          signers_total: Number(l.signers_total ?? 1),
          created_at: String(l.created_at),
          links: [],
        });
      }
      const bucket = batches.get(groupToken)!;
      bucket.signers_total = Math.max(bucket.signers_total, Number(l.signers_total ?? 1));
      if (String(l.created_at) > bucket.created_at) bucket.created_at = String(l.created_at);

      bucket.links.push({
        ...l,
        signer_index: Number(l.signer_index ?? 1),
        signed_at: signedByLinkId.get(String(l.id)) ?? l.signed_at ?? null,
        url: `${data.origin}/signature/${l.token}`,
      });
    }

    const ordered = Array.from(batches.values())
      .map((b) => {
        const linksSorted = b.links.sort((a, z) => a.signer_index - z.signer_index);
        const signedCount = linksSorted.filter((x) => Boolean(x.signed_at)).length;
        const status = signedCount >= b.signers_total
          ? "signed"
          : linksSorted.some((x) => x.active && !x.revoked_at)
            ? "in_progress"
            : "inactive";
        return {
          group_token: b.group_token,
          signers_total: b.signers_total,
          signed_count: signedCount,
          created_at: b.created_at,
          status,
          links: linksSorted,
        };
      })
      .sort((a, z) => (a.created_at < z.created_at ? 1 : -1));

    return { batches: ordered };
  });

// ============ AVOCAT : révocation ============
export const revokeSignatureLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: z.string().uuid().parse(d.id) }))
  .handler(async ({ data, context }) => {
    const { data: link } = await context.supabase
      .from("signature_links").select("id, invoice_id").eq("id", data.id).maybeSingle();
    if (!link) throw new Error("Lien introuvable");
    const { error } = await context.supabase
      .from("signature_links")
      .update({ active: false, revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const { data: prof } = await context.supabase
      .from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    await context.supabase.from("signature_events").insert({
      link_id: link.id,
      invoice_id: link.invoice_id,
      type: "link_revoked",
      actor_id: context.userId,
      actor_label: prof?.full_name ?? "Avocat",
    });
    return { ok: true };
  });

// ============ AVOCAT : PDF signé ============
export const getSignedPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { signature_id: string }) => ({ signature_id: z.string().uuid().parse(d.signature_id) }))
  .handler(async ({ data, context }) => {
    const { data: sig } = await context.supabase
      .from("document_signatures")
      .select("id, storage_path, invoice_id")
      .eq("id", data.signature_id)
      .maybeSingle();
    if (!sig?.storage_path) throw new Error("PDF signé introuvable");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: file, error } = await supabaseAdmin.storage.from("bar-media").download(sig.storage_path);
    if (error || !file) throw new Error("Téléchargement impossible");
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      filename: sig.storage_path.split("/").pop() ?? "document-signe.pdf",
      base64: Buffer.from(bytes).toString("base64"),
    };
  });

// ============ PUBLIC : ouverture du lien ============
export const openSignatureDocument = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; pin?: string | null; origin: string }) => ({
    token: z.string().regex(/^[0-9a-f]{64}$/).parse(d.token),
    pin: z.string().trim().max(8).nullable().optional().parse(d.pin || null),
    origin: z.string().url().parse(d.origin),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sha256Hex } = await import("@/lib/signature-utils");

    const link = await fetchSignatureLinkByToken(supabaseAdmin, data.token);
    if (!link) return { status: "not_found" as const };

    const { invoice: inv, matterDocument: doc } = await hydrateLinkTarget(supabaseAdmin, link);
    const publicDocument = inv ? publicDoc(inv) : publicMatterDocument(doc);
    const { data: existing } = await supabaseAdmin
      .from("document_signatures")
      .select("id, signature_uid, signed_at, first_name, last_name, storage_path")
      .eq("link_id", link.id)
      .maybeSingle();

    if (existing) {
      return {
        status: "already_signed" as const,
        signature: {
          signature_uid: existing.signature_uid,
          signed_at: existing.signed_at,
          signer: `${existing.first_name} ${existing.last_name}`,
        },
        document: publicDocument,
      };
    }
    if (!link.active || link.revoked_at) return { status: "revoked" as const };
    if (link.expires_at && new Date(link.expires_at) < new Date()) return { status: "expired" as const };
    if (link.max_opens && link.opens_count >= link.max_opens) return { status: "exhausted" as const };

    if (link.pin_hash) {
      if (!data.pin) return { status: "pin_required" as const, document: publicDocument };
      if ((await sha256Hex(data.pin)) !== link.pin_hash) {
        await supabaseAdmin.from("signature_events").insert({
          link_id: link.id,
          invoice_id: inv?.id ?? null,
          matter_document_id: doc?.id ?? null,
          type: "pin_failed",
          actor_label: "Destinataire",
        } as any);
        return { status: "pin_invalid" as const, document: publicDocument };
      }
    }

    let bytes: Uint8Array;
    if (inv) {
      // Rendu du PDF original (identique à celui de l'avocat)
      const { data: items } = await supabaseAdmin
        .from("invoice_items").select("*").eq("invoice_id", inv.id).order("position");
      const qrMod = await import("qrcode-generator");
      const qrcode = (qrMod as any).default ?? (qrMod as any);
      const { buildInvoicePdf } = await import("@/lib/pdf/invoice-pdf");
      bytes = buildInvoicePdf({
        invoice: inv,
        items: (items ?? []) as any[],
        verifyUrl: `${data.origin}/verification/facture/${inv.public_token}`,
        qrcode,
      });
    } else {
      if (!doc?.storage_path) throw new Error("Document introuvable.");
      if (doc.mime_type !== "application/pdf") {
        return { status: "unsupported_type" as const, document: publicDocument };
      }
      const { data: file, error: dlErr } = await supabaseAdmin.storage.from("bar-media").download(doc.storage_path);
      if (dlErr || !file) throw new Error("Impossible de charger le document.");
      bytes = new Uint8Array(await file.arrayBuffer());
    }

    await supabaseAdmin
      .from("signature_links")
      .update({
        opens_count: (link.opens_count ?? 0) + 1,
        first_opened_at: link.first_opened_at ?? new Date().toISOString(),
      })
      .eq("id", link.id);

    await supabaseAdmin.from("signature_events").insert({
      link_id: link.id,
      invoice_id: inv?.id ?? null,
      matter_document_id: doc?.id ?? null,
      type: "opened",
      actor_label: "Destinataire",
      metadata: { opens_count: (link.opens_count ?? 0) + 1 },
    } as any);

    return {
      status: "ok" as const,
      document: publicDocument,
      pdfBase64: Buffer.from(bytes).toString("base64"),
      link: { expires_at: link.expires_at },
    };
  });

// ============ PUBLIC : signature commencée ============
export const markSignatureStarted = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => ({ token: z.string().regex(/^[0-9a-f]{64}$/).parse(d.token) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link } = await supabaseAdmin
      .from("signature_links").select("id, invoice_id, matter_document_id, active").eq("token", data.token).maybeSingle();
    if (!link?.active) return { ok: false };
    await supabaseAdmin.from("signature_events").insert({
      link_id: link.id,
      invoice_id: (link as any).invoice_id ?? null,
      matter_document_id: (link as any).matter_document_id ?? null,
      type: "signature_started",
      actor_label: "Destinataire",
    } as any);
    return { ok: true };
  });

// ============ PUBLIC : validation de la signature ============
export const submitSignature = createServerFn({ method: "POST" })
  .inputValidator((d: {
    token: string;
    pin?: string | null;
    origin: string;
    first_name: string;
    last_name: string;
    method: "drawn" | "generated";
    style?: string | null;
    image_base64: string;
    placements: unknown[];
  }) => ({
    token: z.string().regex(/^[0-9a-f]{64}$/).parse(d.token),
    pin: z.string().trim().max(8).nullable().optional().parse(d.pin || null),
    origin: z.string().url().parse(d.origin),
    first_name: z.string().trim().min(1).max(80).parse(d.first_name),
    last_name: z.string().trim().min(1).max(80).parse(d.last_name),
    method: z.enum(["drawn", "generated"]).parse(d.method),
    style: z.string().trim().max(40).nullable().optional().parse(d.style || null),
    image_base64: z.string().min(100).max(4_000_000).parse(d.image_base64),
    placements: z.array(placementSchema).min(1).max(10).parse(d.placements),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sha256Hex, generateSignatureUid, base64ToBytes } = await import("@/lib/signature-utils");
    const { getRequestHeader, getRequestIP } = await import("@tanstack/react-start/server");

    const link = await fetchSignatureLinkByToken(supabaseAdmin, data.token);
    if (!link) throw new Error("Lien invalide");
    if (!link.active || link.revoked_at) throw new Error("Ce lien a été révoqué.");
    if (link.expires_at && new Date(link.expires_at) < new Date()) throw new Error("Ce lien a expiré.");
    if (link.pin_hash && (!data.pin || (await sha256Hex(data.pin)) !== link.pin_hash)) {
      throw new Error("Code d'accès incorrect.");
    }
    const { data: already } = await supabaseAdmin
      .from("document_signatures").select("id").eq("link_id", link.id).maybeSingle();
    if (already) throw new Error("Ce document a déjà été signé.");

    const { invoice: inv, matterDocument: doc } = await hydrateLinkTarget(supabaseAdmin, link);
    const signature_uid = generateSignatureUid();
    const signed_at = new Date().toISOString();
    const ip_address = getRequestIP({ xForwardedFor: true }) ?? null;
    const user_agent = getRequestHeader("user-agent") ?? null;
    const signatureBytes = base64ToBytes(data.image_base64);
    const signatureKind = detectImageKind(signatureBytes);
    if (signatureKind === "unknown") {
      throw new Error("Le format de signature est invalide. Utilisez uniquement une image PNG ou JPG.");
    }
    let verifyUrl: string | null = null;
    let filename = "document-signe.pdf";
    let storage_path = "";
    let bytes: Uint8Array;

    if (inv) {
      if (signatureKind !== "jpeg") {
        throw new Error("Pour ce document, utilisez une signature JPG ou une signature dessinée/générée.");
      }
      verifyUrl = `${data.origin}/verification/facture/${inv.public_token}`;

      // Génération du PDF signé (document original + signature + certificat)
      const { data: items } = await supabaseAdmin
        .from("invoice_items").select("*").eq("invoice_id", inv.id).order("position");
      const qrMod = await import("qrcode-generator");
      const qrcode = (qrMod as any).default ?? (qrMod as any);
      const { buildInvoicePdf } = await import("@/lib/pdf/invoice-pdf");
      const jpeg = signatureBytes;
      bytes = buildInvoicePdf({
        invoice: inv,
        items: (items ?? []) as any[],
        verifyUrl,
        qrcode,
        signature: {
          first_name: data.first_name,
          last_name: data.last_name,
          signature_uid,
          signed_at,
          method: data.method,
          style: data.style,
          ip_address,
          user_agent,
          jpeg,
          placements: data.placements as any,
          verifyUrl,
        },
      });

      filename = `${inv.number ?? "document"}-signe.pdf`;
      storage_path = `signatures/${inv.id}/${signature_uid}-${filename}`;
    } else {
      if (!doc?.storage_path || doc.mime_type !== "application/pdf") {
        throw new Error("Seuls les documents PDF peuvent être signés.");
      }

      const { data: source, error: dlErr } = await supabaseAdmin.storage.from("bar-media").download(doc.storage_path);
      if (dlErr || !source) throw new Error("Impossible de charger le document à signer.");
      const originalBytes = new Uint8Array(await source.arrayBuffer());
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
      const pages = pdf.getPages();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const imageRef = signatureKind === "png"
        ? await pdf.embedPng(signatureBytes)
        : await pdf.embedJpg(signatureBytes);

      for (const p of data.placements as Array<{ page: number; x: number; y: number; width: number; height: number }>) {
        const pageIdx = Math.max(0, Math.min((p.page || 1) - 1, pages.length - 1));
        const page = pages[pageIdx];
        if (!page) continue;
        const w = Math.max(40, Math.min(p.width, page.getWidth()));
        const h = Math.max(20, Math.min(p.height, page.getHeight()));
        const x = Math.max(0, Math.min(p.x, page.getWidth() - w));
        const y = Math.max(0, page.getHeight() - p.y - h);
        page.drawImage(imageRef, { x, y, width: w, height: h });
        page.drawLine({ start: { x, y: Math.max(0, y - 3) }, end: { x: x + w, y: Math.max(0, y - 3) }, thickness: 0.5, color: rgb(0.78, 0.8, 0.84) });
        page.drawText(
          `${data.first_name} ${data.last_name} — signe le ${new Date(signed_at).toLocaleString("fr-FR")}`,
          { x, y: Math.max(0, y - 12), size: 6, font, color: rgb(0.42, 0.43, 0.48) },
        );
      }

      bytes = new Uint8Array(await pdf.save());
      filename = doc.filename;
      storage_path = doc.storage_path;
    }

    const { error: upErr } = await supabaseAdmin.storage
      .from("bar-media")
      .upload(storage_path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`Archivage impossible : ${upErr.message}`);

    const { error: sigErr } = await supabaseAdmin.from("document_signatures").insert({
      link_id: link.id,
      invoice_id: inv?.id ?? null,
      matter_document_id: doc?.id ?? null,
      signature_uid,
      first_name: data.first_name,
      last_name: data.last_name,
      method: data.method,
      style: data.style,
      placements: data.placements as any,
      ip_address,
      user_agent,
      storage_path,
      signed_at,
    } as any);
    if (sigErr) throw new Error(sigErr.message);

    await supabaseAdmin
      .from("signature_links")
      .update({
        signed_at,
        ...(link.invalidate_on_sign ? { active: false } : {}),
      })
      .eq("id", link.id);

    const targetColumn = inv ? "invoice_id" : "matter_document_id";
    const targetId = inv ? inv.id : doc?.id;
    const groupToken = String(link.group_token ?? link.id);

    let signersTotal = Math.max(1, Number(link.signers_total ?? 1));
    let signedCount = 1;
    let fullySigned = true;

    if (targetId) {
      const { data: groupLinks, error: glErr } = await supabaseAdmin
        .from("signature_links")
        .select("id, signers_total")
        .eq(targetColumn, targetId)
        .eq("group_token", groupToken);
      if (glErr) throw new Error(glErr.message);

      const linkIds = (groupLinks ?? []).map((x: any) => String(x.id));
      signersTotal = Math.max(1, Number(groupLinks?.[0]?.signers_total ?? link.signers_total ?? 1));
      if (linkIds.length > 0) {
        const { count, error: cntErr } = await supabaseAdmin
          .from("document_signatures")
          .select("id", { count: "exact", head: true })
          .in("link_id", linkIds);
        if (cntErr) throw new Error(cntErr.message);
        signedCount = Number(count ?? 0);
      }
      fullySigned = signedCount >= signersTotal;
    }

    // Statut du document + traçabilité
    if (inv && fullySigned) {
      await supabaseAdmin
        .from("invoices")
        .update({ status: "accepted" })
        .eq("id", inv.id)
        .not("status", "in", "(paid,cancelled,converted)");
    } else if (doc) {
      const currentVersion = Number(doc.version ?? 1);
      await supabaseAdmin
        .from("matter_documents")
        .update({
          mime_type: "application/pdf",
          size_bytes: bytes.length,
          version: currentVersion + 1,
          updated_at: new Date().toISOString(),
          comment: `Dernière signature: ${data.first_name} ${data.last_name} (${signature_uid})`,
        } as any)
        .eq("id", doc.id);
    }

    await supabaseAdmin.from("signature_events").insert([
      {
        link_id: link.id,
        invoice_id: inv?.id ?? null,
        matter_document_id: doc?.id ?? null,
        type: "signed",
        actor_label: `${data.first_name} ${data.last_name}`,
        metadata: {
          signature_uid,
          method: data.method,
          style: data.style,
          ip_address,
          signer_index: link.signer_index ?? 1,
          signed_count: signedCount,
          signers_total: signersTotal,
          fully_signed: fullySigned,
          group_token: groupToken,
        },
      },
      {
        link_id: link.id,
        invoice_id: inv?.id ?? null,
        matter_document_id: doc?.id ?? null,
        type: "pdf_generated",
        actor_label: "Système", metadata: { storage_path },
      },
    ] as any);

    if (inv?.matter_id && fullySigned) {
      await supabaseAdmin.from("matter_documents").insert({
        matter_id: inv.matter_id,
        filename,
        storage_path,
        mime_type: "application/pdf",
        size_bytes: bytes.length,
        tags: ["signature", inv.kind === "quote" ? "devis" : "facture"],
        comment: `Signé électroniquement par ${data.first_name} ${data.last_name} (${signature_uid})`,
        uploaded_by: inv.owner_id,
      });
      await supabaseAdmin.from("matter_activity").insert({
        matter_id: inv.matter_id,
        actor_id: inv.owner_id,
        action: "document_signed",
        summary: `${inv.kind === "quote" ? "Devis" : "Facture"} ${inv.number ?? ""} signé par ${data.first_name} ${data.last_name}`.trim(),
        entity_type: "invoice",
        entity_id: inv.id,
        metadata: { signature_uid, storage_path },
      });
    } else if (doc?.matter_id && fullySigned) {
      await supabaseAdmin.from("matter_activity").insert({
        matter_id: doc.matter_id,
        actor_id: doc.uploaded_by,
        action: "document_signed",
        summary: `Document ${doc.filename} signé par ${data.first_name} ${data.last_name}`,
        entity_type: "document",
        entity_id: doc.id,
        metadata: { signature_uid, storage_path, replaced_in_place: true },
      });
    }

    if (inv?.owner_id && fullySigned) {
      await supabaseAdmin.from("notifications").insert({
        user_id: inv.owner_id,
        type: "document_signed",
        title: "Document signé",
        body: `${data.first_name} ${data.last_name} a signé ${inv.kind === "quote" ? "le devis" : "la facture"} ${inv.number ?? ""}.`,
        link: `/facturation/${inv.id}`,
        entity_type: "invoice",
        entity_id: inv.id,
      });
    } else if (doc?.owner_id && fullySigned) {
      await supabaseAdmin.from("notifications").insert({
        user_id: doc.owner_id,
        type: "document_signed",
        title: "Document signé",
        body: `${data.first_name} ${data.last_name} a signé le document ${doc.filename}.`,
        link: `/dossiers/${doc.matter_id}`,
        entity_type: "document",
        entity_id: doc.id,
      });
    }

    await supabaseAdmin.from("signature_events").insert({
      link_id: link.id,
      invoice_id: inv?.id ?? null,
      matter_document_id: doc?.id ?? null,
      type: "notified",
      actor_label: "Système",
    } as any);

    return {
      ok: true as const,
      signature_uid,
      signed_at,
      fully_signed: fullySigned,
      signed_count: signedCount,
      signers_total: signersTotal,
      verifyUrl,
      filename,
      base64: Buffer.from(bytes).toString("base64"),
    };
  });
