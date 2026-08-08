import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";

export const Route = createFileRoute("/cgu")({
  head: () => ({ meta: [{ title: "CGU" }] }),
  component: CguPage,
});

function CguPage() {
  return (
    <>
      <PageHeader eyebrow="Conditions" title="Conditions générales d utilisation" description="Règles d utilisation des espaces publics, clients et collaborateurs." />
      <section className="container-page space-y-6 py-12 text-sm text-muted-foreground md:text-base">
        <p>L utilisation des espaces sécurisés suppose une authentification valide et le respect des politiques internes.</p>
        <p>Les accès sont personnels, non cessibles et tracés pour garantir sécurité, conformité et auditabilité.</p>
        <p>Toute action non autorisée peut entraîner suspension d accès et mesures correctives.</p>
      </section>
    </>
  );
}
