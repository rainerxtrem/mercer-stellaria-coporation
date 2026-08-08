import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { CmsSection } from "@/components/site/CmsSection";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, FileText, Calendar, Gavel, GraduationCap, Award } from "lucide-react";

export const Route = createFileRoute("/admissions")({
  head: () => ({ meta: [
    { title: "Admission au Barreau — Mercer & Stellaria Corporation" },
    { name: "description", content: "Conditions, étapes et documents pour rejoindre le Mercer & Stellaria Corporation." },
    { property: "og:title", content: "Admission au Barreau — Mercer & Stellaria Corporation" },
    { property: "og:description", content: "Devenir avocat au sein du groupe : conditions, examen, serment." },
  ] }),
  component: Page,
});

const STEPS = [
  { icon: CheckCircle2, title: "Conditions", items: ["Diplôme de Juris Doctor", "Casier judiciaire vierge", "Résidence dans l'État", "Enquête de moralité"] },
  { icon: FileText, title: "Documents requis", items: ["Formulaire d'inscription", "Diplômes certifiés", "Pièce d'identité", "Deux lettres de recommandation"] },
  { icon: Calendar, title: "Calendrier", items: ["Sessions : février · juin · octobre", "Dépôt du dossier 90 jours avant", "Résultats sous 30 jours"] },
  { icon: GraduationCap, title: "Étapes", items: ["Constitution du dossier", "Examen du Barreau", "Enquête de moralité", "Prestation de serment"] },
  { icon: Gavel, title: "Examen", items: ["Épreuves écrites et orales", "Droit constitutionnel, pénal, civil", "Cas pratiques"] },
  { icon: Award, title: "Serment", items: ["Cérémonie officielle", "Remise de la carte professionnelle", "Inscription au registre"] },
];

function Page() {
  return (
    <>
      <PageHeader eyebrow="Admissions" title="Devenir avocat au sein du groupe" description="Découvrez l'ensemble des conditions, étapes et documents nécessaires pour rejoindre le Barreau." />
      <section className="container-page py-12 space-y-10">
        <CmsSection contentKey="admissions" />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <Card key={s.title} className="shadow-[var(--shadow-card)]">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-navy text-gold font-display font-bold">{i + 1}</div>
                  <div className="font-display text-lg font-bold text-navy-deep">{s.title}</div>
                </div>
                <ul className="mt-4 space-y-2 text-sm text-navy-deep/80">
                  {s.items.map((it) => (
                    <li key={it} className="flex gap-2"><s.icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" /><span>{it}</span></li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </>
  );
}
