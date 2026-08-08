import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet, Landmark, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/investment")({
  head: () => ({
    meta: [
      { title: "Mercer & Stellaria Investment" },
      { name: "description", content: "Présentation de Mercer & Stellaria Investment: gestion de patrimoine, private equity et allocation d actifs." },
    ],
  }),
  component: InvestmentLanding,
});

function InvestmentLanding() {
  return (
    <>
      <PageHeader
        eyebrow="Investment"
        title="Mercer & Stellaria Investment"
        description="Gestion d actifs, private equity et solutions patrimoniales pour clients privés et institutionnels."
      />
      <section className="container-page py-12">
        <div className="grid gap-6 md:grid-cols-2">
          <Feature icon={Wallet} title="Gestion de patrimoine" text="Structuration et pilotage de patrimoine avec suivi des risques et objectifs long terme." />
          <Feature icon={Landmark} title="Private Equity et allocation d actifs" text="Stratégies d investissement ciblées, diversification et pilotage multi-horizons." />
        </div>
        <div className="mt-8">
          <Button asChild className="bg-navy text-white hover:bg-navy-soft">
            <Link to="/connexion">Accéder à l espace client <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function Feature({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <Card className="border-border">
      <CardContent className="p-6">
        <div className="mb-2 inline-flex items-center gap-2 text-gold"><Icon className="h-4 w-4" /></div>
        <h2 className="font-display text-lg font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}
