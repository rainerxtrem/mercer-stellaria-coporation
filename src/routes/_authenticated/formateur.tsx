import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffectiveRoles } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, ShieldAlert, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/formateur")({
  head: () => ({ meta: [{ title: "Espace Formateur — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

function Page() {
  const roles = useEffectiveRoles();
  if (!roles.includes("formateur")) {
    return (
      <div className="container-page py-24 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-gold" />
        <h1 className="mt-4 font-display text-2xl font-bold text-navy-deep">Espace réservé aux Formateurs</h1>
        <p className="mt-2 text-sm text-muted-foreground">Contactez la direction pour obtenir le rôle Formateur.</p>
        <Button asChild className="mt-6 bg-navy text-white"><Link to="/">Retour au portail</Link></Button>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-navy-deep">Espace Formateur</h1>
        <p className="text-sm text-muted-foreground">Concevez et publiez les modules de formation continue du Barreau.</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-[var(--shadow-card)]"><CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-navy"><GraduationCap className="h-5 w-5" /><h2 className="font-semibold">Gestion des formations</h2></div>
          <p className="text-sm text-muted-foreground">Créer, éditer et publier les cours, modules vidéo et évaluations.</p>
          <Button asChild className="bg-navy text-white hover:bg-navy-deep"><Link to="/admin/formations">Ouvrir l'atelier</Link></Button>
        </CardContent></Card>
        <Card className="shadow-[var(--shadow-card)]"><CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2 text-navy"><BookOpen className="h-5 w-5" /><h2 className="font-semibold">Catalogue public</h2></div>
          <p className="text-sm text-muted-foreground">Prévisualiser le rendu vu par les avocats et candidats.</p>
          <Button asChild variant="outline"><Link to="/formations">Voir le catalogue</Link></Button>
        </CardContent></Card>
      </div>
    </div>
  );
}
