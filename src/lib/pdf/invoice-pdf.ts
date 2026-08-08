import { PDF_COLORS, SimplePdfDocument, formatMoney, makeQrMatrix, wrapText } from "@/lib/pdf/simple-pdf";

export type SignaturePlacement = {
  /** Page (1-based) sur laquelle la signature est apposée. */
  page: number;
  /** Coordonnées en points PDF, origine en haut à gauche de la page. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SignatureOverlay = {
  first_name: string;
  last_name: string;
  signature_uid: string;
  signed_at: string;
  method: "drawn" | "generated";
  style?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  /** Image JPEG de la signature. */
  jpeg: Uint8Array;
  placements: SignaturePlacement[];
  verifyUrl: string;
};

type BuildOptions = {
  invoice: Record<string, any>;
  items: Record<string, any>[];
  verifyUrl: string;
  qrcode: unknown;
  signature?: SignatureOverlay | null;
};

const PAGE_W = 595.28;
const PAGE_H = 841.89;

export function buildInvoicePdf({ invoice: inv, items, verifyUrl, qrcode, signature }: BuildOptions): Uint8Array {
  const doc = new SimplePdfDocument(PAGE_W, PAGE_H);
  const left = 50;
  const right = 545;
  let y = 800;

  const ensureSpace = (height: number) => {
    if (y >= height) return;
    doc.addPage(PAGE_W, PAGE_H);
    y = 800;
    doc.text("STATE BAR OF SAN ANDREAS", left, y, { size: 10, font: "bold", color: PDF_COLORS.navy });
    doc.text(String(inv.number ?? ""), right, y, { size: 10, color: PDF_COLORS.gray, align: "right" });
    y -= 24;
    doc.line(left, y, right, y, PDF_COLORS.border, 0.6);
    y -= 20;
  };

  // Header
  doc.text("STATE BAR OF SAN ANDREAS", left, y, { size: 14, font: "bold", color: PDF_COLORS.navy });
  y -= 16;
  doc.text("Ordre officiel des avocats", left, y, { size: 9, color: PDF_COLORS.gray });

  const label = inv.kind === "quote" ? "DEVIS" : "FACTURE";
  doc.text(label, right, 800, { size: 22, font: "bold", color: PDF_COLORS.gold, align: "right" });
  doc.text(inv.number ?? "", right, 780, { size: 11, color: PDF_COLORS.navy, align: "right" });

  y -= 40;
  doc.line(left, y, right, y, PDF_COLORS.navy, 1);
  y -= 20;

  // Parties
  const owner = inv.owner_snapshot?.full_name ?? "Avocat";
  const cs = inv.client_snapshot ?? {};
  const clientName = [cs.first_name, cs.last_name].filter(Boolean).join(" ") || "Client";
  doc.text("Émis par", left, y, { size: 8, color: PDF_COLORS.gray });
  doc.text("Destinataire", 320, y, { size: 8, color: PDF_COLORS.gray });
  y -= 14;
  doc.text(`Me ${owner}`, left, y, { size: 11, font: "bold", color: PDF_COLORS.navy });
  doc.text(clientName, 320, y, { size: 11, font: "bold", color: PDF_COLORS.navy });
  y -= 13;
  if (cs.email) doc.text(String(cs.email), 320, y, { size: 9, color: PDF_COLORS.gray });
  y -= 13;
  if (cs.address) doc.text(String(cs.address).slice(0, 60), 320, y, { size: 9, color: PDF_COLORS.gray });
  if (inv.matter_id || inv.matters?.number) {
    y -= 13;
    const matterLabel = inv.matters?.number ? `Dossier : ${inv.matters.number}` : `Dossier lié : ${inv.matter_id}`;
    doc.text(matterLabel.slice(0, 64), 320, y, { size: 8, color: PDF_COLORS.gray });
  }

  y -= 25;
  doc.text(`Date d'émission : ${inv.issue_date}`, left, y, { size: 9, color: PDF_COLORS.navy });
  if (inv.due_date) doc.text(`Échéance : ${inv.due_date}`, 250, y, { size: 9, color: PDF_COLORS.navy });

  y -= 30;
  doc.rect(left, y - 4, right - left, 18, { fill: PDF_COLORS.lightGray });
  doc.text("Désignation", left + 6, y + 2, { size: 9, font: "bold", color: PDF_COLORS.navy });
  doc.text("Qté", 360, y + 2, { size: 9, font: "bold", color: PDF_COLORS.navy });
  doc.text("PU", 410, y + 2, { size: 9, font: "bold", color: PDF_COLORS.navy });
  doc.text("Total", right - 6, y + 2, { size: 9, font: "bold", color: PDF_COLORS.navy, align: "right" });
  y -= 22;

  for (const it of items ?? []) {
    ensureSpace(190);
    const labelLines = wrapText(String(it.label), 285, 10, "regular").slice(0, 2);
    doc.text(labelLines[0] ?? "Prestation", left + 6, y, { size: 10, color: PDF_COLORS.navy });
    if (it.description) {
      y -= 11;
      doc.text(String(it.description).slice(0, 80), left + 6, y, { size: 8, color: PDF_COLORS.gray });
    }
    doc.text(String(it.quantity), 360, y, { size: 10, color: PDF_COLORS.navy });
    doc.text(Number(it.unit_price).toFixed(2), 410, y, { size: 10, color: PDF_COLORS.navy });
    doc.text(Number(it.line_total).toFixed(2), right - 6, y, { size: 10, font: "bold", color: PDF_COLORS.navy, align: "right" });
    y -= 18;
  }

  // Totals
  ensureSpace(230);
  y -= 10;
  doc.line(340, y, right, y, PDF_COLORS.gray, 0.5);
  y -= 15;
  const putLine = (l: string, v: string, b = false) => {
    doc.text(l, 340, y, { size: 10, font: b ? "bold" : "regular", color: PDF_COLORS.navy });
    doc.text(v, right, y, { size: 10, font: b ? "bold" : "regular", color: PDF_COLORS.navy, align: "right" });
    y -= 14;
  };
  putLine("Sous-total", formatMoney(inv.subtotal, inv.currency));
  putLine(`TVA (${Number(inv.tax_rate).toFixed(2)}%)`, formatMoney(inv.tax_amount, inv.currency));
  y -= 4;
  putLine("TOTAL", formatMoney(inv.total, inv.currency), true);

  if (inv.notes) {
    ensureSpace(160);
    y -= 20;
    doc.text("Notes", left, y, { size: 9, font: "bold", color: PDF_COLORS.navy }); y -= 12;
    for (const ln of wrapText(String(inv.notes), 470, 9, "regular").slice(0, 8)) {
      doc.text(ln.trim(), left, y, { size: 9, color: PDF_COLORS.gray }); y -= 11;
    }
  }

  if (inv.terms) {
    ensureSpace(120);
    y -= 12;
    doc.text("Conditions", left, y, { size: 9, font: "bold", color: PDF_COLORS.navy }); y -= 12;
    for (const ln of wrapText(String(inv.terms), 470, 8, "regular").slice(0, 6)) {
      doc.text(ln.trim(), left, y, { size: 8, color: PDF_COLORS.gray }); y -= 10;
    }
  }

  // QR de vérification (vectoriel)
  const qrMatrix = makeQrMatrix(qrcode, verifyUrl);
  doc.drawQr(qrMatrix, left, 80, 70, PDF_COLORS.black);
  doc.text("Vérification d'authenticité", left + 78, 130, { size: 8, font: "bold", color: PDF_COLORS.navy });
  doc.text("Scannez le QR ou visitez :", left + 78, 118, { size: 7, color: PDF_COLORS.gray });
  doc.text(verifyUrl.slice(0, 60), left + 78, 108, { size: 7, color: PDF_COLORS.gray });

  doc.line(360, 94, 520, 94, PDF_COLORS.navy, 0.6);
  doc.text("Signature", 440, 78, { size: 8, font: "italic", color: PDF_COLORS.gray, align: "center" });
  doc.text("Mercer & Stellaria Corporation — Document officiel", left, 40, { size: 7, color: PDF_COLORS.gray });

  // ============ SIGNATURE ÉLECTRONIQUE ============
  if (signature) {
    const ref = doc.addJpeg(signature.jpeg);
    for (const p of signature.placements) {
      const pageIndex = Math.max(0, Math.min((p.page || 1) - 1, doc.pageCount - 1));
      doc.selectPage(pageIndex);
      const w = Math.max(40, Math.min(p.width, PAGE_W));
      const h = Math.max(20, Math.min(p.height, PAGE_H));
      const x = Math.max(0, Math.min(p.x, PAGE_W - w));
      const yBottom = Math.max(0, PAGE_H - p.y - h);
      doc.drawImage(ref, x, yBottom, w, h);
      doc.line(x, yBottom - 3, x + w, yBottom - 3, PDF_COLORS.border, 0.5);
      doc.text(
        `${signature.first_name} ${signature.last_name} — signé le ${formatDateTime(signature.signed_at)}`,
        x,
        yBottom - 13,
        { size: 6, color: PDF_COLORS.gray },
      );
    }

    // Page de certificat
    doc.addPage(PAGE_W, PAGE_H);
    let cy = 780;
    doc.rect(0, 800, PAGE_W, 42, { fill: PDF_COLORS.navy });
    doc.text("CERTIFICAT DE SIGNATURE ÉLECTRONIQUE", left, 814, { size: 13, font: "bold", color: PDF_COLORS.white });
    doc.text("Mercer & Stellaria Corporation", left, 62, { size: 7, color: PDF_COLORS.gray });

    cy = 750;
    doc.text(
      "Ce certificat atteste que le document ci-joint a été signé électroniquement par le signataire identifié ci-dessous.",
      left, cy, { size: 9, color: PDF_COLORS.gray },
    );
    cy -= 30;

    const rows: [string, string][] = [
      ["Document", `${inv.kind === "quote" ? "Devis" : "Facture"} ${inv.number ?? ""}`],
      ["Montant total", formatMoney(inv.total, inv.currency)],
      ["Émis par", `Me ${owner}`],
      ["Signataire", `${signature.first_name} ${signature.last_name}`],
      ["Date et heure de signature", formatDateTime(signature.signed_at)],
      ["Méthode de signature", signature.method === "drawn" ? "Signature dessinée à la main" : `Signature générée (style ${signature.style ?? "—"})`],
      ["Identifiant unique de signature", signature.signature_uid],
      ["Adresse IP du signataire", signature.ip_address ?? "non communiquée"],
      ["Navigateur", (signature.user_agent ?? "non communiqué").slice(0, 70)],
      ["Vérification en ligne", signature.verifyUrl.slice(0, 70)],
    ];

    for (const [k, v] of rows) {
      doc.rect(left, cy - 6, right - left, 24, { fill: cy % 48 < 24 ? PDF_COLORS.lightGray : PDF_COLORS.white });
      doc.text(k, left + 8, cy + 2, { size: 8, font: "bold", color: PDF_COLORS.navy });
      doc.text(String(v), left + 200, cy + 2, { size: 8, color: PDF_COLORS.gray });
      cy -= 26;
    }

    cy -= 20;
    const sigRef = doc.addJpeg(signature.jpeg);
    doc.text("Signature apposée", left, cy, { size: 8, font: "bold", color: PDF_COLORS.navy });
    cy -= 90;
    doc.rect(left, cy, 220, 80, { stroke: PDF_COLORS.border, lineWidth: 0.6 });
    doc.drawImage(sigRef, left + 8, cy + 10, 200, 60);

    const certQr = makeQrMatrix(qrcode, signature.verifyUrl);
    doc.drawQr(certQr, 380, cy, 80, PDF_COLORS.black);
    doc.text("Vérifier ce document", 380, cy - 12, { size: 7, color: PDF_COLORS.gray });

    doc.text(
      "Document scellé : toute modification postérieure invalide la signature.",
      left, 90, { size: 7, color: PDF_COLORS.gray },
    );
  }

  return doc.save();
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} à ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
