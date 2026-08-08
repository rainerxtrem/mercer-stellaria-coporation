import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import hero from "@/assets/hero-courthouse.jpg";
import batonnier from "@/assets/batonnier.jpg";
import logo from "@/assets/ms-logo.png";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listPublishedNews, getPublicStats } from "@/lib/public-content.functions";
import {
  Search, ShieldCheck, GraduationCap, Users, Building2, BookOpen,
  Gavel, HeartHandshake, ScrollText, ArrowRight, Scale,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Mercer & Stellaria Corporation — Groupe privé" },
    { name: "description", content: "Mercer & Stellaria Corporation : sécurisez vos actifs, garantissez vos contrats, défendez vos droits. Entités juridiques, sécurité, immobilier et conseil." },
    { property: "og:title", content: "Mercer & Stellaria Corporation" },
    { property: "og:description", content: "Sécurisez vos actifs, garantissez vos contrats, défendez vos droits." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Home,
});

const SERVICES = [
  { icon: Users, title: "Registre des conseils", desc: "Consulter l'ensemble des conseils juridiques du groupe.", to: "/avocats" },
  { icon: Building2, title: "Entités du groupe", desc: "Toutes les structures autorisées à exercer.", to: "/cabinets" },
  { icon: ShieldCheck, title: "Vérification des licences", desc: "Recherche instantanée du statut d'une licence.", to: "/verification" },
  { icon: ScrollText, title: "Rejoindre le groupe", desc: "Démarches, conditions et calendrier.", to: "/admissions" },
  { icon: GraduationCap, title: "Formation continue", desc: "Catalogue et inscriptions.", to: "/formations" },
  { icon: BookOpen, title: "Bibliothèque juridique", desc: "Codes, lois, jurisprudence et doctrine.", to: "/bibliotheque" },
  { icon: Gavel, title: "Commission de déontologie", desc: "Procédures et décisions publiées.", to: "/discipline" },
  { icon: HeartHandshake, title: "Nous contacter", desc: "Formulaire officiel de contact.", to: "/contact" },
  { icon: GraduationCap, title: "Examen d'admission", desc: "Sessions, épreuves et résultats.", to: "/examen" },
] as const;

function fr(n: number) { return n.toLocaleString("fr-FR"); }

function Home() {
  const newsFn = useServerFn(listPublishedNews);
  const statsFn = useServerFn(getPublicStats);
  const { data: news = [] } = useQuery({ queryKey: ["public-news"], queryFn: () => newsFn(), staleTime: 60_000 });
  const { data: stats } = useQuery({ queryKey: ["public-stats"], queryFn: () => statsFn(), staleTime: 60_000 });

  const statCards = [
    { label: "Conseils inscrits", value: fr(stats?.lawyers_total ?? 0) },
    { label: "Entités du groupe", value: fr(stats?.firms_total ?? 0) },
    { label: "Licences actives", value: fr(stats?.licenses_active ?? 0) },
    { label: "Sessions d'examen", value: fr(stats?.exams_total ?? 0) },
    { label: "Publications", value: fr(stats?.news_published ?? 0) },
  ];

  return (
    <>
      <section className="relative isolate overflow-hidden">
        <img src={hero} alt="Siège Mercer & Stellaria Corporation" width={1920} height={1080}
          className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(120deg,#05080f_0%,rgba(8,12,21,0.94)_42%,rgba(11,17,28,0.78)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(900px_420px_at_15%_0%,rgba(198,166,98,0.14),transparent_65%)]" aria-hidden />
        <div className="relative container-page py-24 md:py-36">
          <div className="max-w-3xl text-white">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/35 bg-white/5 px-3.5 py-1.5 text-[11px] uppercase tracking-[0.24em] text-gold-soft backdrop-blur animate-[fade-in_0.6s_var(--ease-premium)_both]">
              <Scale className="h-3.5 w-3.5" /> {BRAND.kicker}
            </div>
            <div className="flex items-center gap-5">
              <img src={logo} alt="" width={72} height={72} className="hidden h-16 w-16 shrink-0 object-contain animate-[float_6s_ease-in-out_infinite] sm:block" />
              <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl animate-[fade-up_0.7s_var(--ease-premium)_both]">
                Mercer <span className="text-gold">&amp;</span> Stellaria
                <span className="mt-1 block text-xl font-medium tracking-[0.3em] text-white/60 md:text-2xl">CORPORATION</span>
              </h1>
            </div>
            <p className="mt-8 max-w-2xl text-lg text-gold-soft md:text-xl animate-[fade-up_0.9s_var(--ease-premium)_both]">
              {BRAND.tagline}
            </p>
            <div className="mt-10 flex flex-wrap gap-3 animate-[fade-up_1.05s_var(--ease-premium)_both]">
              <Button asChild size="lg" className="press bg-gold text-[#0a0e16] shadow-[var(--shadow-gold)] hover:bg-gold-soft">
                <Link to="/avocats"><Search className="mr-2 h-4 w-4" />Trouver un conseil</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="press border-white/25 bg-white/5 text-white backdrop-blur transition-colors hover:border-gold/60 hover:bg-white/10">
                <Link to="/verification"><ShieldCheck className="mr-2 h-4 w-4" />Vérifier une licence</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="press border-white/25 bg-white/5 text-white backdrop-blur transition-colors hover:border-gold/60 hover:bg-white/10">
                <Link to="/admissions"><GraduationCap className="mr-2 h-4 w-4" />Rejoindre le groupe</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-background">
        <div className="container-page py-14">
          <div className="stagger-children grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {statCards.map((s) => (
              <div key={s.label} className="hover-lift rounded-lg border border-border bg-secondary/50 p-5 text-center shadow-[var(--shadow-card)]">
                <div className="font-display text-3xl font-bold text-gold">{s.value}</div>
                <div className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary py-20">
        <div className="container-page grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Qui sommes-nous</div>
            <h2 className="mt-2 font-display text-3xl font-bold text-foreground md:text-4xl gold-underline">
              Une holding au service de vos intérêts
            </h2>
            <div className="mt-8 space-y-6 text-foreground/80">
              <Block title="Mission" text="Protéger le patrimoine, sécuriser les engagements contractuels et défendre les droits de nos clients à travers toutes les entités du groupe." />
              <Block title="Vision" text="Un groupe privé moderne et discret, réunissant conseil juridique, sécurité, immobilier et stratégie sous une exigence unique d'excellence." />
              <Block title="Valeurs" text="Discrétion · Rigueur · Excellence · Loyauté · Confidentialité · Performance." />
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-2xl bg-gold/20 blur-2xl" aria-hidden />
            <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-elegant)]">
              <img src={batonnier} alt="Direction générale de Mercer & Stellaria Corporation" width={800} height={1000} loading="lazy" className="w-full object-cover transition-transform duration-700 hover:scale-[1.03]" />
              <div className="border-t-2 border-gold p-6">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Chief Executive Officer</div>
                <div className="mt-1 font-display text-xl font-bold text-foreground">Alexander Whitmore</div>
                <div className="text-sm text-muted-foreground">Direction générale du groupe</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Nos services</div>
            <h2 className="mt-2 font-display text-3xl font-bold text-foreground md:text-4xl gold-underline">
              Une plateforme unique pour toutes nos entités
            </h2>
          </div>
          <div className="stagger-children mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map((s) => (
              <Link key={s.title} to={s.to} className="group">
                <Card className="hover-lift h-full border-border">
                  <CardContent className="p-7">
                    <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-gold/25 bg-gold/10 text-gold transition-all duration-300 group-hover:scale-105 group-hover:bg-gold group-hover:text-[#0a0e16]">
                      <s.icon className="h-6 w-6" />
                    </div>
                    <div className="font-display text-lg font-bold text-foreground">{s.title}</div>
                    <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
                    <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-navy transition-colors group-hover:text-gold">
                      Accéder <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary py-20">
        <div className="container-page">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Actualités</div>
              <h2 className="mt-2 font-display text-3xl font-bold text-foreground gold-underline">Dernières publications</h2>
            </div>
            <Button asChild variant="outline" className="press border-gold/50 text-gold hover:bg-gold hover:text-[#0a0e16]">
              <Link to="/actualites">Toutes les actualités <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
          </div>
          {news.length === 0 ? (
            <div className="mt-10 rounded-xl border border-border bg-card py-14 text-center text-sm text-muted-foreground">
              Aucune actualité publiée pour le moment.
            </div>
          ) : (
            <div className="stagger-children mt-10 grid gap-6 md:grid-cols-3">
              {news.slice(0, 3).map((n) => (
                <Card key={n.id} className="hover-lift overflow-hidden border-border shadow-[var(--shadow-card)]">
                  <div className="h-1.5 bg-gold" />
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                      {n.tag && <span className="rounded bg-navy/10 px-2 py-0.5 font-semibold text-navy">{n.tag}</span>}
                      {(n.published_at || n.created_at) && (
                        <span>{new Date(n.published_at ?? n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
                      )}
                    </div>
                    <h3 className="mt-3 font-display text-lg font-bold text-foreground">{n.title}</h3>
                    {n.excerpt && <p className="mt-2 text-sm text-muted-foreground">{n.excerpt}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="gov-gradient text-white">
        <div className="container-page flex flex-col items-start gap-6 py-16 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold md:text-3xl">Vous êtes collaborateur du groupe ?</h2>
            <p className="mt-2 text-white/75">Accédez à votre espace : dossiers, documents, signatures, facturation et formations.</p>
          </div>
          <Button asChild size="lg" className="press bg-gold text-[#0a0e16] shadow-[var(--shadow-gold)] hover:bg-gold-soft">
            <Link to="/espace-avocat">Accéder à mon espace</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function Block({ title, text }: { title: string; text: string }) {
  return (
    <div className="border-l-2 border-gold pl-5">
      <div className="font-display text-lg font-bold text-foreground">{title}</div>
      <p className="mt-1 text-sm md:text-base">{text}</p>
    </div>
  );
}
