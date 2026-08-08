import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, ArrowRight, FileCheck2, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/assurances")({
  head: () => ({
    meta: [
      { title: "Mercer & Stellaria Insurance" },
      { name: "description", content: "Présentation de Mercer & Stellaria Insurance et accès client assurance." },
    ],
  }),
  component: InsuranceLanding,
});

function InsuranceLanding() {
  return (
    <>
      <PageHeader
        eyebrow="Insurance"
        title="Mercer & Stellaria Insurance"
        description="Offres santé, pro et patrimoniales avec souscription, suivi des dossiers et indemnisation pilotées en ligne."
      />
      <section className="container-page grid gap-6 py-12 md:grid-cols-3">
        <ActionCard icon={ShieldCheck} title="Accéder à mon espace" text="Contrats, paiements, messagerie conseiller." to="/connexion?service=assurance" />
        <ActionCard icon={FileCheck2} title="Télécharger une attestation" text="Retrouvez vos documents contractuels en quelques clics." to="/connexion?service=assurance" />
        <ActionCard icon={AlertTriangle} title="Déclarer un sinistre" text="Lancez votre dossier et joignez les pièces nécessaires." to="/connexion?service=assurance" />
      </section>
    </>
  );
}

function ActionCard({ icon: Icon, title, text, to }: { icon: any; title: string; text: string; to: string }) {
  return (
    <Card className="hover-lift border-border">
      <CardContent className="p-6">
        <div className="mb-2 inline-flex items-center gap-2 text-gold"><Icon className="h-4 w-4" /> Action</div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <Button asChild variant="link" className="mt-2 px-0 text-navy hover:text-gold">
          <Link to={to as any}>Ouvrir <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
      </CardContent>
    </Card>
  );
}
