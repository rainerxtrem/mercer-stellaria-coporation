import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/inscription")({
  head: () => ({
    meta: [{ title: "Inscription" }],
  }),
  component: InscriptionPage,
});

function InscriptionPage() {
  return (
    <>
      <PageHeader
        eyebrow="Accès"
        title="Créer un compte"
        description="Les comptes sont créés via les parcours d intégration du groupe pour garantir conformité et sécurité." 
      />
      <section className="container-page py-12">
        <Card className="border-border">
          <CardContent className="p-7">
            <p className="text-sm text-muted-foreground md:text-base">
              Pour les collaborateurs, l accès est géré par l administration. Pour les clients, l ouverture est initiée par votre conseiller.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="bg-navy text-white hover:bg-navy-soft">
                <Link to="/admissions">Parcours admissions</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/contact">Contacter le groupe</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
