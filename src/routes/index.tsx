import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import hero from "@/assets/hero-courthouse.jpg";
import logo from "@/assets/ms-logo.png";
import seal from "@/assets/seal.png";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { listPublishedNews, getPublicStats } from "@/lib/public-content.functions";
import {
  Search, ShieldCheck, Users, Building2, BookOpen,
  Gavel, HeartHandshake, ScrollText, ArrowRight, Scale, Briefcase,
  Wallet, Landmark, Lock, BadgeCheck, FileCheck2,
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

const CORPORATE_IMAGE = "/dist/client/assets/Mercer_Stellaria_CORPORATION%20(1).png";

const QUICK_INSURANCE_ACTIONS = [
  {
    title: "Accéder à mon espace",
    desc: "Contrats, paiements, messagerie conseiller.",
    to: "/connexion?service=assurance",
  },
  {
    title: "Télécharger une attestation",
    desc: "Retrouvez vos documents contractuels en quelques clics.",
    to: "/connexion?service=assurance",
  },
  {
    title: "Déclarer un sinistre",
    desc: "Lancez votre dossier et joignez les pièces nécessaires.",
    to: "/connexion?service=assurance",
  },
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
              <Scale className="h-3.5 w-3.5" /> Vision de groupe
            </div>
            <div className="flex items-center gap-5">
              <img src={logo} alt="" width={72} height={72} className="hidden h-16 w-16 shrink-0 object-contain animate-[float_6s_ease-in-out_infinite] sm:block" />
              <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl animate-[fade-up_0.7s_var(--ease-premium)_both]">
                Mercer <span className="text-gold">&amp;</span> Stellaria
                <span className="mt-1 block text-xl font-medium tracking-[0.3em] text-white/60 md:text-2xl">CORPORATION</span>
              </h1>
            </div>
            <p className="mt-8 max-w-2xl text-lg text-gold-soft md:text-xl animate-[fade-up_0.9s_var(--ease-premium)_both]">
              La base du groupe: une holding qui orchestre le droit, l assurance et l investissement.
            </p>
            <p className="mt-4 max-w-2xl text-base text-white/85 md:text-lg animate-[fade-up_0.95s_var(--ease-premium)_both]">
              Mercer & Stellaria Corporation pilote le Mercer & Stellaria Law Office, Mercer & Stellaria Insurance et Mercer & Stellaria Investment.
            </p>
            <div className="mt-10 flex flex-wrap gap-3 animate-[fade-up_1.05s_var(--ease-premium)_both]">
              <Button asChild size="lg" className="press bg-gold text-[#0a0e16] shadow-[var(--shadow-gold)] hover:bg-gold-soft">
                <Link to="/cabinet"><Search className="mr-2 h-4 w-4" />Le cabinet</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="press border-white/25 bg-white/5 text-white backdrop-blur transition-colors hover:border-gold/60 hover:bg-white/10">
                <Link to="/assurances"><ShieldCheck className="mr-2 h-4 w-4" />Assurances</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="press border-white/25 bg-white/5 text-white backdrop-blur transition-colors hover:border-gold/60 hover:bg-white/10">
                <Link to="/investment"><Landmark className="mr-2 h-4 w-4" />Investment</Link>
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
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Présentation générale du groupe</div>
            <h2 className="mt-2 font-display text-3xl font-bold text-foreground md:text-4xl gold-underline">
              Mercer & Stellaria Corporation
            </h2>
            <div className="mt-8 space-y-6 text-foreground/80">
              <Block title="Holding" text="Direction stratégique, gouvernance et standards qualité transverses pour toutes les entités." />
              <Block title="Law Office" text="Conseil, contentieux stratégique, gouvernance et médiation pour dirigeants, entreprises et particuliers." />
              <Block title="Insurance" text="Protection assurantielle santé, pro et patrimoniale avec parcours digitaux sécurisés." />
              <Block title="Investment" text="Gestion de patrimoine, private equity et allocation d actifs pour clients privés et institutionnels." />
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-2xl bg-gold/20 blur-2xl" aria-hidden />
            <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-elegant)]">
              <img src={CORPORATE_IMAGE} alt="Direction générale de Mercer & Stellaria Corporation" width={800} height={1000} loading="lazy" className="w-full object-cover transition-transform duration-700 hover:scale-[1.03]" />
              <div className="border-t-2 border-gold p-6">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Mercer & Stellaria Corporation</div>
                <div className="mt-1 font-display text-xl font-bold text-foreground">Synergie des expertises</div>
                <div className="text-sm text-muted-foreground">Une direction commune, une exécution spécialisée, une expérience client unifiée.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Pôles du groupe</div>
            <h2 className="mt-2 font-display text-3xl font-bold text-foreground md:text-4xl gold-underline">
              HOLDING | LAW OFFICE | INSURANCE | INVESTMENT
            </h2>
          </div>
          <div className="stagger-children mt-12 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Briefcase,
                title: "Mercer & Stellaria Law Office",
                desc: "Conseil, contentieux stratégique, gouvernance et médiation.",
                to: "/cabinet",
              },
              {
                icon: ShieldCheck,
                title: "Mercer & Stellaria Insurance",
                desc: "Offres santé, pro et patrimoniales avec parcours assurantiels digitalisés.",
                to: "/assurances",
              },
              {
                icon: Wallet,
                title: "Mercer & Stellaria Investment",
                desc: "Gestion de patrimoine, private equity et allocation d actifs.",
                to: "/investment",
              },
            ].map((s) => (
              <Link key={s.title} to={s.to as any} className="group">
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
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Assurance - accès rapide client</div>
              <h2 className="mt-2 font-display text-3xl font-bold text-foreground gold-underline">Déjà client Mercer & Stellaria Insurance ?</h2>
              <p className="mt-3 max-w-3xl text-sm text-muted-foreground md:text-base">
                Retrouvez vos services prioritaires en accès direct pour gagner du temps sur les actions les plus fréquentes.
              </p>
            </div>
          </div>
          <div className="stagger-children mt-10 grid gap-6 md:grid-cols-3">
            {QUICK_INSURANCE_ACTIONS.map((action) => (
              <Link key={action.title} to={action.to as any} className="group">
                <Card className="hover-lift h-full border-border shadow-[var(--shadow-card)]">
                  <CardContent className="p-6">
                    <div className="mb-4 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-gold">
                      <ShieldCheck className="h-4 w-4" /> Action
                    </div>
                    <h3 className="font-display text-lg font-bold text-foreground">{action.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{action.desc}</p>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-navy transition-colors group-hover:text-gold">
                      Ouvrir <ArrowRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container-page">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold">Valeurs et engagements</div>
            <h2 className="mt-2 font-display text-3xl font-bold text-foreground md:text-4xl gold-underline">
              L excellence d un groupe, la synergie de trois expertises
            </h2>
            <p className="mt-4 text-sm text-muted-foreground md:text-base">
              Mercer & Stellaria rassemble sous un même toit le conseil juridique, la protection assurantielle et l ingénierie financière.
            </p>
          </div>
          <div className="stagger-children mt-10 grid gap-6 md:grid-cols-3">
            <ValueCard
              icon={Gavel}
              overline="Accompagnement global"
              title="Sécurité juridique et assurantielle"
              text="Nos avocats et experts assurance sécurisent structures, contrats et actifs stratégiques."
              to="/cabinet"
            />
            <ValueCard
              icon={Wallet}
              overline="Gestion de patrimoine"
              title="Private Equity et allocation d actifs"
              text="Des solutions sur-mesure de valorisation patrimoniale et d investissement pour vos objectifs long terme."
              to="/investment"
            />
            <ValueCard
              icon={Users}
              overline="Sécurité et proximité"
              title="Espaces clients sécurisés"
              text="Suivez vos dossiers, contrats et portefeuilles en temps réel depuis vos espaces dédiés 24/7."
              to="/connexion"
            />
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
        <div className="container-page py-16">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-white/20 bg-white/5 text-white">
              <CardContent className="p-6">
                <div className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-gold-soft">
                  <Users className="h-4 w-4" /> Espace client
                </div>
                <h3 className="font-display text-2xl font-bold">Connexion aux espaces clients</h3>
                <p className="mt-2 text-white/75">Contrats, paiements, signatures, messagerie, documents.</p>
                <Button asChild size="sm" className="mt-5 bg-gold text-[#0a0e16] hover:bg-gold-soft">
                  <Link to="/connexion">Accéder à mon espace</Link>
                </Button>
              </CardContent>
            </Card>
            <Card className="border-white/20 bg-white/5 text-white">
              <CardContent className="p-6">
                <div className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-gold-soft">
                  <Briefcase className="h-4 w-4" /> Espace collaborateur
                </div>
                <h3 className="font-display text-2xl font-bold">Portail collaborateur</h3>
                <p className="mt-2 text-white/75">Pilotage des dossiers, clients, facturation et conformité opérationnelle.</p>
                <Button asChild size="sm" className="mt-5 bg-gold text-[#0a0e16] hover:bg-gold-soft">
                  <Link to="/espace-avocat">Accéder au portail</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <LegalPillar icon={Lock} title="Sécurité / SSL" text="Flux chiffrés, contrôle des accès et surveillance active des espaces sensibles." />
            <LegalPillar icon={BadgeCheck} title="Conformité réglementaire" text="Référentiels de conformité, gouvernance et contrôle interne sur les activités du groupe." />
            <LegalPillar icon={FileCheck2} title="Cadre juridique" text="Mentions légales, politique de confidentialité et CGU accessibles en permanence." />
          </div>
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

function ValueCard({
  icon: Icon,
  overline,
  title,
  text,
  to,
}: {
  icon: any;
  overline: string;
  title: string;
  text: string;
  to: string;
}) {
  return (
    <Card className="hover-lift h-full border-border">
      <CardContent className="p-6">
        <div className="mb-3 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-gold">
          <Icon className="h-4 w-4" /> {overline}
        </div>
        <h3 className="font-display text-xl font-bold text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
        <Link to={to as any} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-navy hover:text-gold">
          En savoir plus <ArrowRight className="h-4 w-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

function LegalPillar({ icon: Icon, title, text }: { icon: any; title: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/5 p-5">
      <div className="mb-2 inline-flex items-center gap-2 text-gold-soft">
        <Icon className="h-4 w-4" />
      </div>
      <div className="font-display text-base font-bold">{title}</div>
      <p className="mt-1 text-sm text-white/75">{text}</p>
    </div>
  );
}
