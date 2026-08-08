import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { Button } from "@/components/ui/button";
import { LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/espace-batonnier")({
  head: () => ({ meta: [{ title: "Administration Corporate — Mercer & Stellaria Corporation" }] }),
  component: () => (
    <>
      <PageHeader eyebrow="Administration" title="Administration Corporate" description="L'interface d'administration complète est désormais accessible aux détenteurs du rôla direction." />
      <section className="container-page py-16 text-center">
        <Button asChild size="lg" className="bg-navy text-white hover:bg-navy-deep">
          <Link to="/admin"><LayoutDashboard className="mr-2 h-5 w-5" />Accéder au tableau de bord</Link>
        </Button>
      </section>
    </>
  ),
});
