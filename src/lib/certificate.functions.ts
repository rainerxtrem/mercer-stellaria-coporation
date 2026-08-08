import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { PDF_COLORS, SimplePdfDocument, makeQrMatrix, wrapText } from "@/lib/pdf/simple-pdf";

// Génère un certificat PDF pour une tentative validée.
export const renderTrainingCertificate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    attempt_id: z.string().uuid(),
    origin: z.string().url(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Vérifier accès : le titulaire ou la direction
    const { data: attempt } = await context.supabase
      .from("training_attempts")
      .select("id, user_id, points_awarded, max_score, passed, submitted_at, training_id")
      .eq("id", data.attempt_id).maybeSingle();
    if (!attempt) throw new Error("Tentative introuvable");
    if (!(attempt as any).passed) throw new Error("La formation n'est pas validée.");

    const { data: isBat } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "batonnier" });
    if ((attempt as any).user_id !== context.userId && !isBat) throw new Error("Accès refusé");

    const [{ data: training }, { data: lawyer }] = await Promise.all([
      context.supabase.from("trainings").select("title, points, pass_threshold, duration_min").eq("id", (attempt as any).training_id).maybeSingle(),
      context.supabase.from("lawyers").select("first_name, last_name, license").eq("profile_id", (attempt as any).user_id).maybeSingle(),
    ]);

    const qrMod = await import("qrcode-generator");
    const qrcode = (qrMod as any).default ?? (qrMod as any);

    const doc = new SimplePdfDocument(842, 595); // A4 paysage
    const W = 842, H = 595;

    // Bordure dorée
    doc.rect(20, 20, W - 40, H - 40, { stroke: PDF_COLORS.gold, lineWidth: 2 });
    doc.rect(30, 30, W - 60, H - 60, { stroke: PDF_COLORS.navy, lineWidth: 0.5 });

    // Bandeau supérieur
    doc.text("STATE BAR OF SAN ANDREAS", W / 2, H - 70, { size: 14, font: "bold", color: PDF_COLORS.navy, align: "center" });
    doc.text("Ordre des Avocats du Barreau", W / 2, H - 88, { size: 9, font: "italic", color: PDF_COLORS.gray, align: "center" });

    // Titre
    doc.text("CERTIFICAT DE FORMATION CONTINUE", W / 2, H - 140, { size: 22, font: "bold", color: PDF_COLORS.navy, align: "center" });
    doc.line(W / 2 - 100, H - 152, W / 2 + 100, H - 152, PDF_COLORS.gold, 1.5);

    // Corps
    doc.text("Le CEO certifie que", W / 2, H - 200, { size: 11, color: PDF_COLORS.gray, align: "center" });

    const nom = lawyer ? `Me ${(lawyer as any).first_name} ${(lawyer as any).last_name}` : "L'avocat concerné";
    doc.text(nom.toUpperCase(), W / 2, H - 240, { size: 24, font: "bold", color: PDF_COLORS.navy, align: "center" });

    if ((lawyer as any)?.license) {
      doc.text(`Licence ${(lawyer as any).license}`, W / 2, H - 258, { size: 9, font: "italic", color: PDF_COLORS.gray, align: "center" });
    }

    doc.text("a suivi et validé avec succès la formation", W / 2, H - 300, { size: 11, color: PDF_COLORS.gray, align: "center" });
    const title = ((training as any)?.title ?? "").toString();
    const titleLines = wrapText(`« ${title} »`, 620, 16, "bold").slice(0, 2);
    titleLines.forEach((line, index) => doc.text(line, W / 2, H - 330 - index * 18, { size: 16, font: "bold", color: PDF_COLORS.navy, align: "center" }));

    // Détails
    const pts = (attempt as any).points_awarded ?? 0;
    const max = (attempt as any).max_score ?? 0;
    const pct = max > 0 ? Math.round((pts / max) * 100) : 0;
    doc.text(`Score : ${pts} / ${max} (${pct}%)`, W / 2, H - 375, { size: 10, color: PDF_COLORS.gray, align: "center" });
    if ((training as any)?.points) {
      doc.text(`Crédits accordés : ${(training as any).points} points`, W / 2, H - 390, { size: 10, color: PDF_COLORS.gray, align: "center" });
    }

    const submitted = new Date((attempt as any).submitted_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    doc.text(`Délivré le ${submitted}`, 60, 60, { size: 9, color: PDF_COLORS.gray });

    // QR de vérification
    const url = `${data.origin}/verification?certificate=${encodeURIComponent(data.attempt_id)}`;
    const size = 80;
    const qx = W - size - 60, qy = 60;
    doc.drawQr(makeQrMatrix(qrcode, url), qx, qy, size, PDF_COLORS.navy);
    doc.text("Vérifier le certificat", qx - 4, qy + size + 6, { size: 7, font: "bold", color: PDF_COLORS.navy });

    // Signature
    doc.text("Le CEO", W / 2, 100, { size: 10, font: "italic", color: PDF_COLORS.gray, align: "center" });
    doc.line(W / 2 - 70, 82, W / 2 + 70, 82, PDF_COLORS.navy, 0.5);

    const bytes = doc.save();
    const b64 = Buffer.from(bytes).toString("base64");
    const filename = `certificat-${(lawyer as any)?.license ?? "avocat"}-${submitted.replace(/\s/g, "-")}.pdf`;
    return { filename, base64: b64 };
  });
