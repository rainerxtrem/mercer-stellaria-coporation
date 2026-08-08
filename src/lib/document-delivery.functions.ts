import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DELIVERY_MODES } from "@/lib/delivery-status";
import { z } from "zod";

/**
 * Envoi d'un devis / facture au client :
 * - Portail Client (le client consulte et signe depuis son espace)
 * - Lien sécurisé sans compte (lien unique, expirant)
 * - Les deux
 * Un jeton de signature est systématiquement émis ; il n'est exposé au client
 * du portail qu'à travers une fonction serveur authentifiée.
 */
export const sendDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    invoice_id: string;
    mode: string;
    expires_in_days?: number | null;
    max_opens?: number | null;
    pin?: string | null;
    message?: string | null;
  }) => ({
    invoice_id: z.string().uuid().parse(d.invoice_id),
    mode: z.enum(DELIVERY_MODES).parse(d.mode),
    expires_in_days: z.number().int().min(1).max(365).nullable().optional().parse(d.expires_in_days ?? 14),
    max_opens: z.number().int().min(1).max(100).nullable().optional().parse(d.max_opens ?? null),
    pin: z.string().trim().regex(/^\d{4,8}$/, "Le code doit contenir 4 à 8 chiffres").nullable().optional().parse(d.pin || null),
    message: z.string().trim().max(1000).nullable().optional().parse(d.message || null),
  }))
  .handler(async ({ data, context }) => {
    const { generateToken, sha256Hex } = await import("@/lib/signature-utils");

    const { data: inv, error: invErr } = await context.supabase
      .from("invoices")
      .select("id, number, kind, status, matter_id, client_id, delivery_status, total, currency")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (invErr || !inv) throw new Error("Document introuvable");
    if (["signed", "cancelled"].includes(inv.delivery_status ?? "")) {
      throw new Error("Ce document est verrouillé et ne peut plus être envoyé.");
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
        invalidate_on_sign: true,
      })
      .select("id, token, expires_at")
      .single();
    if (error) throw new Error(error.message);

    const now = new Date().toISOString();
    const { error: upErr } = await context.supabase
      .from("invoices")
      .update({
        delivery_mode: data.mode,
        delivery_status: "sent",
        sent_at: now,
        ...(inv.status === "draft" ? { status: "sent" } : {}),
      })
      .eq("id", data.invoice_id);
    if (upErr) throw new Error(upErr.message);

    const { data: prof } = await context.supabase
      .from("profiles").select("full_name").eq("id", context.userId).maybeSingle();

    await context.supabase.from("signature_events").insert({
      link_id: link.id,
      invoice_id: data.invoice_id,
      type: "link_created",
      actor_id: context.userId,
      actor_label: prof?.full_name ?? "Cabinet",
      metadata: { mode: data.mode, expires_at, pin: Boolean(data.pin) },
    });

    const label = inv.kind === "quote" ? "Devis" : "Facture";

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase, context.userId, inv.matter_id,
      "document_sent",
      `${label} ${inv.number ?? ""} envoyé (${data.mode === "portal" ? "portail client" : data.mode === "link" ? "lien sécurisé" : "portail + lien"})`.trim(),
      { entity_type: "invoice", entity_id: data.invoice_id, metadata: { mode: data.mode } },
    );

    let notified = false;
    if (data.mode !== "link" && inv.client_id) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { notifyClient } = await import("@/lib/notify.server");
      const { data: client } = await supabaseAdmin
        .from("clients")
        .select("profile_id, discord_webhook_url")
        .eq("id", inv.client_id)
        .maybeSingle();
      if (client?.profile_id) {
        await notifyClient(supabaseAdmin, client, {
          type: "document_to_sign",
          title: `${label} ${inv.number ?? ""} à consulter`.trim(),
          body: data.message ?? `Un nouveau document de ${Number(inv.total).toFixed(2)} ${inv.currency} vous attend dans votre espace.`,
          link: "/portail-client/signatures",
          entity_type: "invoice",
          entity_id: inv.id,
        });
        notified = true;
        await supabaseAdmin.from("signature_events").insert({
          link_id: link.id, invoice_id: inv.id, type: "notified", actor_label: "Système",
          metadata: { channel: "portail + discord" },
        });
      }
    }

    return {
      token: link.token as string,
      expires_at: link.expires_at as string | null,
      mode: data.mode,
      client_notified: notified,
      share_link: data.mode !== "portal",
    };
  });

/** Annulation d'un envoi : le document repasse hors circuit de signature. */
export const cancelDocumentDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string }) => ({ invoice_id: z.string().uuid().parse(d.invoice_id) }))
  .handler(async ({ data, context }) => {
    const { data: inv } = await context.supabase
      .from("invoices").select("id, kind, number, matter_id, delivery_status").eq("id", data.invoice_id).maybeSingle();
    if (!inv) throw new Error("Document introuvable");
    if (inv.delivery_status === "signed") throw new Error("Un document signé ne peut plus être annulé.");

    const now = new Date().toISOString();
    const { error } = await context.supabase
      .from("invoices")
      .update({ delivery_status: "cancelled", cancelled_at: now })
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);

    await context.supabase
      .from("signature_links")
      .update({ active: false, revoked_at: now })
      .eq("invoice_id", data.invoice_id)
      .is("revoked_at", null);

    const { logMatterActivity } = await import("@/lib/activity-log");
    await logMatterActivity(
      context.supabase, context.userId, inv.matter_id,
      "document_cancelled",
      `${inv.kind === "quote" ? "Devis" : "Facture"} ${inv.number ?? ""} annulé`.trim(),
      { entity_type: "invoice", entity_id: data.invoice_id },
    );
    return { ok: true };
  });

/** Historique complet d'envoi / consultation / signature d'un document. */
export const listDeliveryHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string }) => ({ invoice_id: z.string().uuid().parse(d.invoice_id) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("signature_events")
      .select("*")
      .eq("invoice_id", data.invoice_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
