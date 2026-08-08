import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { getPublicLawyer } from "@/lib/public-content.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./avocats";
import { MapPin, Building2, Calendar, Award, Loader2 } from "lucide-react";

export const Route = createFileRoute("/avocats/$id")({
  head: ({ params }) => ({ meta: [
    { title: `Fiche officielle — ${params.id}` },
    { name: "description", content: "Fiche officielle publique d'un avocat inscrit au Mercer & Stellaria Corporation." },
    { property: "og:title", content: `Fiche officielle — Avocat ${params.id}` },
    { property: "og:description", content: "Registre officiel du Mercer & Stellaria Corporation." },
  ] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const fn = useServerFn(getPublicLawyer);
  const { data: l, isLoading } = useQuery({
    queryKey: ["public-lawyer", id],
    queryFn: () => fn({ data: { id } }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="container-page py-24 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-navy" />
      </div>
    );
  }

  if (!l) {
    return (
      <div className="container-page py-24 text-center">
        <h1 className="font-display text-3xl font-bold text-navy-deep">Avocat introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cette fiche n'existe pas ou n'est plus publique.</p>
        <Button asChild className="mt-6 bg-navy"><Link to="/avocats">Retour au registre</Link></Button>
      </div>
    );
  }

  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(`https://sanandreasbar.gov/avocats/${l.id}`)}`;

  return (
    <>
      <PageHeader eyebrow="Fiche officielle" title={`Me ${l.first_name} ${l.last_name}`} description={`Licence ${l.license}${l.specialty ? " · " + l.specialty : ""}`} />
      <section className="container-page py-12">
        <div className="grid gap-8 lg:grid-cols-3">
          <Card className="shadow-[var(--shadow-elegant)]">
            <CardContent className="p-6 text-center">
              {l.photo_url ? (
                <img src={l.photo_url} alt="" width={200} height={200} className="mx-auto h-40 w-40 rounded-full border-4 border-gold object-cover" loading="lazy" />
              ) : (
                <div className="mx-auto grid h-40 w-40 place-items-center rounded-full border-4 border-gold bg-navy text-3xl font-bold text-white">
                  {(l.first_name?.[0] ?? "") + (l.last_name?.[0] ?? "")}
                </div>
              )}
              <div className="mt-5 font-display text-xl font-bold text-navy-deep">Me {l.first_name} {l.last_name}</div>
              {l.specialty && <div className="mt-1 text-sm text-muted-foreground">{l.specialty}</div>}
              <div className="mt-4 flex justify-center"><StatusBadge status={l.status} /></div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 shadow-[var(--shadow-card)]">
            <CardContent className="p-6 md:p-8">
              <h2 className="font-display text-xl font-bold text-navy-deep gold-underline">Informations professionnelles</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Info icon={Award} label="Numéro de licence" value={l.license} />
                <Info icon={Calendar} label="Date d'admission" value={new Date(l.admitted_on).toLocaleDateString("fr-FR")} />
                {l.firm_name && <Info icon={Building2} label="Cabinet" value={l.firm_name} />}
                {l.city && <Info icon={MapPin} label="Ville" value={l.city} />}
                {l.bio && <div className="sm:col-span-2 mt-2"><div className="text-xs uppercase tracking-wider text-muted-foreground">Biographie</div><p className="mt-1 text-sm leading-relaxed text-navy-deep/85">{l.bio}</p></div>}
              </div>
              <p className="mt-6 rounded-md border border-border bg-secondary/60 p-3 text-xs text-muted-foreground">
                Les coordonnées personnelles (email, téléphone, adresse) ne sont pas publiées. Pour joindre Me {l.last_name}, contactez son cabinet ou utilisez le <Link to="/contact" className="text-navy underline">formulaire officiel</Link>.
              </p>
            </CardContent>
          </Card>

          <Card className="lg:col-span-3 border-2 border-gold/40 shadow-[var(--shadow-elegant)]">
            <CardContent className="grid gap-8 p-8 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-gold">Carte professionnelle</div>
                <div className="mt-2 font-display text-2xl font-bold text-navy-deep">Mercer & Stellaria Corporation</div>
                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <div><span className="text-muted-foreground">Titulaire :</span> Me {l.first_name} {l.last_name}</div>
                  <div><span className="text-muted-foreground">Licence :</span> {l.license}</div>
                  <div><span className="text-muted-foreground">Émise le :</span> {new Date(l.admitted_on).toLocaleDateString("fr-FR")}</div>
                  <div><span className="text-muted-foreground">Statut :</span> <StatusBadge status={l.status} /></div>
                </div>
              </div>
              <img src={qr} alt="QR Code de vérification" width={180} height={180} className="rounded-md border border-border bg-white p-2" loading="lazy" />
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  );
}

function Info({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-1 font-medium text-navy-deep">{value}</div>
    </div>
  );
}
