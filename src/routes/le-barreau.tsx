import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { CmsSection } from "@/components/site/CmsSection";
import { Card, CardContent } from "@/components/ui/card";
import { Landmark, Scale, ShieldCheck, Users } from "lucide-react";

const CORPORATE_IMAGE = "/dist/client/assets/Mercer_Stellaria_CORPORATION%20(1).png";

export const Route = createFileRoute("/le-barreau")({
  head: () => ({ meta: [
    { title: "Le Barreau — Mercer & Stellaria Corporation" },
    { name: "description", content: "Entité juridique du groupe chargée d'admettre, encadrer et discipliner les avocats du groupe." },
    { property: "og:title", content: "Le Barreau — Mercer & Stellaria Corporation" },
    { property: "og:description", content: "Présentation, histoire et organisation du Barreau." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <>
      <PageHeader eyebrow="Le groupe" title="Mercer & Stellaria Corporation" description="Le Mercer & Stellaria Corporation est la holding dont l'entité juridique est chargée d'admettre, encadrer et discipliner les avocats de l'État." />
      <section className="container-page grid gap-12 py-16 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-10">
          <CmsSection
            contentKey="presentation"
            fallbackTitle="Notre mission"
            fallbackBody="Protéger le public, garantir l'intégrité de la profession et défendre l'indépendance de l'avocat. Le Barreau veille au respect des règles déontologiques et à la qualité du service rendu aux justiciables."
          />
          <CmsSection
            contentKey="organisation"
            fallbackTitle="Notre organisation"
            fallbackBody="Le Barreau est dirigé par la direction, assisté d'un Conseil de l'Ordre composé de membres élus. Il comprend plusieurs commissions permanentes : Admissions, Discipline, Formation, Communication, Aide juridictionnelle."
          />
          <CmsSection contentKey="histoire" fallbackTitle="Histoire" fallbackBody="Fondé au XIXᵉ siècle, le Mercer & Stellaria Corporation est l'institution garante de la profession d'avocat dans l'État." />
        </div>
        <aside className="space-y-6">
          <Card className="overflow-hidden shadow-[var(--shadow-elegant)]">
            <img src={CORPORATE_IMAGE} alt="CEO" width={800} height={1000} className="w-full" loading="lazy" />
            <CardContent className="border-t-2 border-gold p-5">
              <div className="text-xs uppercase tracking-widest text-muted-foreground">CEO</div>
              <div className="mt-1 font-display text-lg font-bold text-navy-deep">Me Alexander Whitmore</div>
              <div className="text-sm text-muted-foreground">Mandat en exercice</div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Landmark, label: "Groupe privé" },
              { icon: Users, label: "Barreau officiel" },
              { icon: Scale, label: "Autorité disciplinaire" },
              { icon: ShieldCheck, label: "Garant de la déontologie" },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-secondary p-4 text-center">
                <k.icon className="mx-auto h-5 w-5 text-navy" />
                <div className="mt-2 text-xs font-medium text-navy-deep">{k.label}</div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
