import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/cabinet")({
  head: () => ({
    meta: [
      { title: "Mercer & Stellaria Law Office" },
      { name: "description", content: "Présentation du Mercer & Stellaria Law Office et accès aux parcours juridiques." },
    ],
  }),
  component: CabinetLanding,
});

function CabinetLanding() {
  return (
    <>
      <PageHeader
        eyebrow="Law Office"
        title="Mercer & Stellaria Law Office"
        description="Conseil, contentieux stratégique, gouvernance et médiation pour dirigeants, entreprises et particuliers."
      />
      <section className="container-page py-12">
        <Card className="border-border">
          <CardContent className="p-7">
            <div className="mb-3 inline-flex items-center gap-2 text-gold"><Building2 className="h-4 w-4" /> Expertise juridique</div>
            <p className="text-sm text-muted-foreground md:text-base">
              Le pôle juridique accompagne les clients sur les sujets de conformité, contrats, gestion du risque, conflits et arbitrage.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="bg-navy text-white hover:bg-navy-soft">
                <Link to="/avocats">Registre des avocats <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/contact">Contacter le cabinet</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
