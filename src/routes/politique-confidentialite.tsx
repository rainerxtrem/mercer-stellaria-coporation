import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";

export const Route = createFileRoute("/politique-confidentialite")({
  head: () => ({ meta: [{ title: "Politique de confidentialité" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <>
      <PageHeader eyebrow="RGPD" title="Politique de confidentialité" description="Principes de traitement des données personnelles et de sécurité des informations." />
      <section className="container-page space-y-6 py-12 text-sm text-muted-foreground md:text-base">
        <p>Les données sont traitées pour la gestion des accès, des dossiers et des services souscrits.</p>
        <p>Les échanges sont sécurisés via chiffrement SSL/TLS et contrôles d accès par rôle et entreprise.</p>
        <p>Les personnes concernées disposent de droits d accès, rectification et suppression selon la réglementation applicable.</p>
        <p>Pour toute demande, utilisez le canal officiel de contact de la plateforme.</p>
      </section>
    </>
  );
}
