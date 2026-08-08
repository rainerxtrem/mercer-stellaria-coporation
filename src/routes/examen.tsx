import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { CmsSection } from "@/components/site/CmsSection";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/examen")({
  head: () => ({ meta: [
    { title: "Examen du Barreau — Mercer & Stellaria Corporation" },
    { name: "description", content: "Sessions, épreuves et résultats de l'examen d'admission au Mercer & Stellaria Corporation." },
    { property: "og:title", content: "Examen du Barreau — Mercer & Stellaria Corporation" },
    { property: "og:description", content: "Toutes les informations pratiques sur l'examen d'admission au Barreau." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader eyebrow="Examen" title="Examen du Barreau" description="Toutes les informations pratiques sur l'examen d'admission au Mercer & Stellaria Corporation." />
      <section className="container-page py-12">
        <Card>
          <CardContent className="p-8">
            <CmsSection
              contentKey="examen"
              fallbackTitle="Nature de l'examen"
              fallbackBody={`L'examen du Barreau évalue les connaissances théoriques et pratiques des candidats en droit constitutionnel, pénal, civil, commercial et de procédure. Il comprend des épreuves écrites et un grand oral.

## Sessions
- Session de Février
- Session de Juin
- Session d'Octobre

## Inscription
Les inscriptions se font en ligne via l'Espace Candidat.

## Résultats
Les résultats sont publiés dans les 30 jours suivant les épreuves.`}
            />
          </CardContent>
        </Card>
      </section>
    </>
  );
}
