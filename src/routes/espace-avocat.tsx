import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./avocats";
import { Download, IdCard, Building2, Award, Loader2, ShieldAlert } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyLawyer, renderLawyerCard } from "@/lib/lawyer-card.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/espace-avocat")({
  head: () => ({ meta: [{ title: "Espace Avocat — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

type Lawyer = {
  id: string; license: string; first_name: string; last_name: string;
  photo_url: string | null; specialty: string | null; city: string | null;
  status: "active" | "suspended" | "revoked"; admitted_on: string;
  firms?: { name: string } | null;
};

function Page() {
  const [me, setMe] = useState<Lawyer | null>(null);
  const [loading, setLoading] = useState(true);
  const [dl, setDl] = useState(false);
  const load = useServerFn(getMyLawyer);
  const render = useServerFn(renderLawyerCard);

  useEffect(() => { (async () => {
    try { setMe((await load()) as Lawyer | null); } catch {}
    setLoading(false);
  })(); }, []);

  async function downloadCard() {
    setDl(true);
    try {
      const res = await render({ data: { origin: window.location.origin } });
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setDl(false); }
  }

  if (loading) return <div className="grid min-h-[60vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-navy" /></div>;

  if (!me) return (
    <>
      <PageHeader eyebrow="Portail sécurisé" title="Espace Avocat" />
      <section className="container-page py-16">
        <Card className="mx-auto max-w-lg border-amber-300"><CardContent className="p-8 text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-amber-600" />
          <h3 className="mt-3 font-display text-xl font-bold text-navy-deep">Aucune fiche d'avocat</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Votre compte n'est pas encore lié à une fiche du registre. Contactez la direction pour recevoir une invitation officielle.
          </p>
          <Button asChild className="mt-4 bg-navy hover:bg-navy-deep"><Link to="/contact">Contacter le Barreau</Link></Button>
        </CardContent></Card>
      </section>
    </>
  );

  return (
    <>
      <PageHeader eyebrow="Portail sécurisé" title="Espace Avocat" description={`Bienvenue, Me ${me.first_name} ${me.last_name}.`} />
      <section className="container-page grid gap-6 py-12 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-2 border-gold/40 shadow-[var(--shadow-elegant)]">
          <CardContent className="grid gap-6 p-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-gold">Carte professionnelle</div>
              <div className="mt-2 font-display text-2xl font-bold text-navy-deep">Me {me.first_name} {me.last_name}</div>
              <div className="mt-3 grid gap-2 text-sm">
                <div><span className="text-muted-foreground">Licence :</span> <span className="font-mono">{me.license}</span></div>
                <div><span className="text-muted-foreground">Cabinet :</span> {me.firms?.name ?? "Indépendant"}</div>
                <div><span className="text-muted-foreground">Ville :</span> {me.city ?? "—"}</div>
                <div><span className="text-muted-foreground">Statut :</span> <StatusBadge status={me.status} /></div>
              </div>
              <Button onClick={downloadCard} disabled={dl} className="mt-6 bg-navy hover:bg-navy-deep">
                {dl ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Télécharger ma carte (PDF)
              </Button>
            </div>
            {me.photo_url ? (
              <img src={me.photo_url} alt="" className="h-32 w-32 rounded-full object-cover border-4 border-gold/40" />
            ) : (
              <div className="grid h-32 w-32 place-items-center rounded-full bg-navy text-3xl font-bold text-gold">
                {me.first_name[0]}{me.last_name[0]}
              </div>
            )}
          </CardContent>
        </Card>

        <StatCard icon={IdCard} label="Licence" value={me.status === "active" ? "Active" : me.status === "suspended" ? "Suspendue" : "Radiée"} />
        <StatCard icon={Building2} label="Cabinet" value={me.firms?.name ?? "Indépendant"} />
        <StatCard icon={Award} label="Admission" value={new Date(me.admitted_on).toLocaleDateString("fr-FR")} />
      </section>
    </>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-11 w-11 place-items-center rounded-lg bg-navy text-gold"><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="truncate font-display font-bold text-navy-deep">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
