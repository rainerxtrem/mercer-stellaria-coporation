import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PDF_COLORS, SimplePdfDocument, makeQrMatrix } from "@/lib/pdf/simple-pdf";

// Récupère la ligne "lawyer" de l'utilisateur connecté (ou d'un id si le
// CEO demande la carte d'un autre avocat).
export const getMyLawyer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lawyers")
      .select("id, license, first_name, last_name, photo_url, specialty, city, status, admitted_on, email, phone, firm_id, firms(name)")
      .eq("profile_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

// Rend la carte professionnelle au format CR80 (85.60 x 53.98 mm ≈ 242 x 153 pt),
// avec QR code de vérification renvoyant sur /verification?license=<licence>.
export const renderLawyerCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { lawyerId?: string; origin: string }) => ({
    lawyerId: d.lawyerId ? z.string().uuid().parse(d.lawyerId) : undefined,
    origin: z.string().url().parse(d.origin),
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("lawyers")
      .select("id, license, first_name, last_name, specialty, city, status, admitted_on, firms(name)");
    if (data.lawyerId) {
      const { data: isBat } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "batonnier" });
      if (!isBat) throw new Error("Accès refusé");
      query = query.eq("id", data.lawyerId);
    } else {
      query = query.eq("profile_id", context.userId);
    }
    const { data: lw, error } = await query.maybeSingle();
    if (error || !lw) throw new Error("Aucune fiche avocat associée à ce compte.");

    const qrMod = await import("qrcode-generator");
    const qrcode = (qrMod as any).default ?? (qrMod as any);

    // Format CR80 paysage
    const W = 242.65, H = 153.07;
    const doc = new SimplePdfDocument(W, H);

    // Fond navy
    doc.rect(0, 0, W, H, { fill: PDF_COLORS.navy });
    // Bande dorée haute
    doc.rect(0, H - 22, W, 22, { fill: PDF_COLORS.gold });
    doc.text("STATE BAR OF SAN ANDREAS", 10, H - 16, { size: 9, font: "bold", color: PDF_COLORS.navy });

    // Bandeau info
    doc.text("CARTE PROFESSIONNELLE", 10, H - 36, { size: 6, font: "bold", color: PDF_COLORS.gold });

    // Nom
    const nom = `Me ${lw.first_name} ${lw.last_name}`.toUpperCase();
    doc.text(nom.slice(0, 32), 10, H - 55, { size: 11, font: "bold", color: PDF_COLORS.white });

    // Détails
    let y = H - 72;
    const line = (label: string, value: string) => {
      doc.text(label, 10, y, { size: 6, color: PDF_COLORS.gold });
      doc.text(value.slice(0, 36), 10, y - 8, { size: 8, font: "bold", color: PDF_COLORS.white });
      y -= 20;
    };
    line("LICENCE", lw.license);
    line("CABINET", (lw as any).firms?.name ?? "Indépendant");
    if (lw.specialty) line("SPÉCIALITÉ", lw.specialty);

    // Statut
    const statusLabel = lw.status === "active" ? "ACTIVE" : lw.status === "suspended" ? "SUSPENDUE" : "RADIÉE";
    const statusColor = lw.status === "active" ? PDF_COLORS.green : PDF_COLORS.amber;
    doc.rect(10, 8, 60, 12, { fill: statusColor });
    doc.text(statusLabel, 14, 11, { size: 7, font: "bold", color: PDF_COLORS.navy });

    // Admis le
    doc.text(`Admis(e) le ${new Date(lw.admitted_on).toLocaleDateString("fr-FR")}`, 78, 12, { size: 6, color: PDF_COLORS.white });

    // QR code de vérification (renvoie vers /verification?license=…)
    const verifyUrl = `${data.origin}/verification?license=${encodeURIComponent(lw.license)}`;
    const qrSize = 62;
    const qrX = W - qrSize - 8;
    const qrY = 8;
    doc.rect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4, { fill: PDF_COLORS.white });
    doc.drawQr(makeQrMatrix(qrcode, verifyUrl), qrX, qrY, qrSize, PDF_COLORS.navy);
    doc.text("Vérifier", qrX + 10, qrY + qrSize + 3, { size: 6, font: "bold", color: PDF_COLORS.gold });

    const bytes = doc.save();
    const b64 = Buffer.from(bytes).toString("base64");
    return { filename: `carte-pro-${lw.license}.pdf`, base64: b64 };
  });
