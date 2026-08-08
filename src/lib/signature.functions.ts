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

    const { data: link } = await supabaseAdmin
      .from("signature_links")
      .select("*, invoices(*, matters(id,number,title))")
      .eq("token", data.token)
      .maybeSingle();
    if (!link) return { status: "not_found" as const };

    const inv: any = (link as any).invoices;
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
        document: publicDoc(inv),
      };
    }
    if (!link.active || link.revoked_at) return { status: "revoked" as const };
    if (link.expires_at && new Date(link.expires_at) < new Date()) return { status: "expired" as const };
    if (link.max_opens && link.opens_count >= link.max_opens) return { status: "exhausted" as const };

    if (link.pin_hash) {
      if (!data.pin) return { status: "pin_required" as const, document: publicDoc(inv) };
      if ((await sha256Hex(data.pin)) !== link.pin_hash) {
        await supabaseAdmin.from("signature_events").insert({
          link_id: link.id, invoice_id: inv.id, type: "pin_failed", actor_label: "Destinataire",
        });
        return { status: "pin_invalid" as const, document: publicDoc(inv) };
      }
    }

    // Rendu du PDF original (identique à celui de l'avocat)
    const { data: items } = await supabaseAdmin
      .from("invoice_items").select("*").eq("invoice_id", inv.id).order("position");
    const qrMod = await import("qrcode-generator");
    const qrcode = (qrMod as any).default ?? (qrMod as any);
    const { buildInvoicePdf } = await import("@/lib/pdf/invoice-pdf");
    const bytes = buildInvoicePdf({
      invoice: inv,
      items: (items ?? []) as any[],
      verifyUrl: `${data.origin}/verification/facture/${inv.public_token}`,
      qrcode,
    });

    await supabaseAdmin
      .from("signature_links")
      .update({
        opens_count: (link.opens_count ?? 0) + 1,
        first_opened_at: link.first_opened_at ?? new Date().toISOString(),
      })
      .eq("id", link.id);

    await supabaseAdmin.from("signature_events").insert({
      link_id: link.id, invoice_id: inv.id, type: "opened", actor_label: "Destinataire",
      metadata: { opens_count: (link.opens_count ?? 0) + 1 },
    });

    return {
      status: "ok" as const,
      document: publicDoc(inv),
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
      .from("signature_links").select("id, invoice_id, active").eq("token", data.token).maybeSingle();
    if (!link?.active) return { ok: false };
    await supabaseAdmin.from("signature_events").insert({
      link_id: link.id, invoice_id: link.invoice_id, type: "signature_started", actor_label: "Destinataire",
    });
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

    const { data: link } = await supabaseAdmin
      .from("signature_links")
      .select("*, invoices(*, matters(id,number,title))")
      .eq("token", data.token)
      .maybeSingle();
    if (!link) throw new Error("Lien invalide");
    if (!link.active || link.revoked_at) throw new Error("Ce lien a été révoqué.");
    if (link.expires_at && new Date(link.expires_at) < new Date()) throw new Error("Ce lien a expiré.");
    if (link.pin_hash && (!data.pin || (await sha256Hex(data.pin)) !== link.pin_hash)) {
      throw new Error("Code d'accès incorrect.");
    }
    const { data: already } = await supabaseAdmin
      .from("document_signatures").select("id").eq("link_id", link.id).maybeSingle();
    if (already) throw new Error("Ce document a déjà été signé.");

    const inv: any = (link as any).invoices;
    const signature_uid = generateSignatureUid();
    const signed_at = new Date().toISOString();
    const ip_address = getRequestIP({ xForwardedFor: true }) ?? null;
    const user_agent = getRequestHeader("user-agent") ?? null;
    const verifyUrl = `${data.origin}/verification/facture/${inv.public_token}`;

    // Génération du PDF signé (document original + signature + certificat)
    const { data: items } = await supabaseAdmin
      .from("invoice_items").select("*").eq("invoice_id", inv.id).order("position");
    const qrMod = await import("qrcode-generator");
    const qrcode = (qrMod as any).default ?? (qrMod as any);
    const { buildInvoicePdf } = await import("@/lib/pdf/invoice-pdf");
    const jpeg = base64ToBytes(data.image_base64);
    const bytes = buildInvoicePdf({
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

    const filename = `${inv.number ?? "document"}-signe.pdf`;
    const storage_path = `signatures/${inv.id}/${signature_uid}-${filename}`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("bar-media")
      .upload(storage_path, bytes, { contentType: "application/pdf", upsert: true });
    if (upErr) throw new Error(`Archivage impossible : ${upErr.message}`);

    const { error: sigErr } = await supabaseAdmin.from("document_signatures").insert({
      link_id: link.id,
      invoice_id: inv.id,
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
    });
    if (sigErr) throw new Error(sigErr.message);

    await supabaseAdmin
      .from("signature_links")
      .update({
        signed_at,
        ...(link.invalidate_on_sign ? { active: false } : {}),
      })
      .eq("id", link.id);

    // Statut du document + traçabilité
    await supabaseAdmin
      .from("invoices")
      .update({ status: "accepted" })
      .eq("id", inv.id)
      .not("status", "in", "(paid,cancelled,converted)");

    await supabaseAdmin.from("signature_events").insert([
      {
        link_id: link.id, invoice_id: inv.id, type: "signed",
        actor_label: `${data.first_name} ${data.last_name}`,
        metadata: { signature_uid, method: data.method, style: data.style, ip_address },
      },
      {
        link_id: link.id, invoice_id: inv.id, type: "pdf_generated",
        actor_label: "Système", metadata: { storage_path },
      },
    ]);

    if (inv.matter_id) {
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
    }

    await supabaseAdmin.from("notifications").insert({
      user_id: inv.owner_id,
      type: "document_signed",
      title: "Document signé",
      body: `${data.first_name} ${data.last_name} a signé ${inv.kind === "quote" ? "le devis" : "la facture"} ${inv.number ?? ""}.`,
      link: `/facturation/${inv.id}`,
      entity_type: "invoice",
      entity_id: inv.id,
    });
    await supabaseAdmin.from("signature_events").insert({
      link_id: link.id, invoice_id: inv.id, type: "notified", actor_label: "Système",
    });

    return {
      ok: true as const,
      signature_uid,
      signed_at,
      verifyUrl,
      filename,
      base64: Buffer.from(bytes).toString("base64"),
    };
  });
