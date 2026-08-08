import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";

export const Route = createFileRoute("/mentions-legales")({
  head: () => ({ meta: [{ title: "Mentions légales" }] }),
  component: MentionsLegalesPage,
});

function MentionsLegalesPage() {
  return (
    <>
      <PageHeader eyebrow="Cadre juridique" title="Mentions légales" description="Informations légales relatives au groupe Mercer & Stellaria Corporation." />
      <section className="container-page space-y-6 py-12 text-sm text-muted-foreground md:text-base">
        <p>Éditeur: Mercer & Stellaria Corporation.</p>
        <p>Objet: portail d information, accès client et collaborateur, services juridiques, assurantiels et patrimoniaux.</p>
        <p>Contact: via le formulaire officiel de la page contact.</p>
        <p>Le contenu de ce site est protégé et réservé au cadre des activités du groupe.</p>
      </section>
    </>
  );
}
