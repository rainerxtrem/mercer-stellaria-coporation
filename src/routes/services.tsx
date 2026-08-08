import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  Users, Building2, ShieldCheck, ScrollText, GraduationCap, BookOpen,
  Gavel, Mail, Newspaper, ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/services")({
  head: () => ({ meta: [
    { title: "Services — Mercer & Stellaria Corporation" },
    { name: "description", content: "Services officiels du Mercer & Stellaria Corporation : registre, vérification, admission, formation, bibliothèque." },
    { property: "og:title", content: "Services — Mercer & Stellaria Corporation" },
    { property: "og:description", content: "Ensemble des services publics offerts par le Mercer & Stellaria Corporation." },
  ] }),
  component: Page,
});

// Chaque entrée pointe vers une route qui EXISTE réellement dans le portail.
const SERVICES = [
  { icon: Users, title: "Registre officiel des avocats", desc: "Consultation de l'ensemble des avocats inscrits.", to: "/avocats" },
  { icon: Building2, title: "Registre officiel des cabinets", desc: "Tous les cabinets autorisés à exercer.", to: "/cabinets" },
  { icon: ShieldCheck, title: "Vérification des licences", desc: "Recherche instantanée du statut d'une licence.", to: "/verification" },
  { icon: ScrollText, title: "Admission au Barreau", desc: "Démarches, conditions et calendrier.", to: "/admissions" },
  { icon: GraduationCap, title: "Examen du Barreau", desc: "Sessions, épreuves et résultats.", to: "/examen" },
  { icon: GraduationCap, title: "Formation continue", desc: "Catalogue et inscriptions.", to: "/formations" },
  { icon: BookOpen, title: "Bibliothèque juridique", desc: "Codes, lois, jurisprudence, doctrine.", to: "/bibliotheque" },
  { icon: Gavel, title: "Le Barreau", desc: "Institution, mission, organisation.", to: "/le-barreau" },
  { icon: Newspaper, title: "Actualités", desc: "Communiqués officiels et décisions.", to: "/actualites" },
  { icon: Mail, title: "Nous contacter", desc: "Formulaire officiel de contact.", to: "/contact" },
] as const;

function Page() {
  return (
    <>
      <PageHeader eyebrow="Services" title="Nos services officiels" description="Le Barreau met à disposition des avocats, des citoyens et des institutions un ensemble complet de services publics." />
      <section className="container-page py-12">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s) => (
            <Link key={s.title} to={s.to} className="group">
              <Card className="h-full transition-all hover:-translate-y-1 hover:border-gold hover:shadow-[var(--shadow-elegant)]">
                <CardContent className="p-7">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-navy text-white group-hover:bg-navy-deep"><s.icon className="h-6 w-6" /></div>
                  <div className="font-display text-lg font-bold text-navy-deep">{s.title}</div>
                  <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                  <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-navy group-hover:text-gold">Accéder <ArrowRight className="h-4 w-4" /></div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
