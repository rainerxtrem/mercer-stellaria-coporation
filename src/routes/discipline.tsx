import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublicDecisions } from "@/lib/disciplinary.functions";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { PageHeader } from "@/components/site/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Scale } from "lucide-react";

export const Route = createFileRoute("/discipline")({
  head: () => ({
    meta: [
      { title: "Commission disciplinaire — Mercer & Stellaria Corporation" },
      { name: "description", content: "Décisions disciplinaires publiées et procédure de signalement au Barreau." },
      { property: "og:title", content: "Commission disciplinaire" },
      { property: "og:description", content: "Consultez les décisions disciplinaires publiées et déposez un signalement." },
    ],
  }),
  component: Page,
});

const LABEL: Record<string, string> = {
  dismissal: "Classement",
  warning: "Avertissement",
  reprimand: "Blâme",
  suspension: "Suspension",
  disbarment: "Radiation",
};
const TONE: Record<string, string> = {
  dismissal: "bg-secondary text-secondary-foreground",
  warning: "bg-warning/15 text-warning",
  reprimand: "bg-warning/15 text-warning",
  suspension: "bg-destructive/15 text-destructive",
  disbarment: "bg-rose-200 text-rose-900",
};

function Page() {
  const fn = useServerFn(listPublicDecisions);
  const { data, isLoading } = useQuery({ queryKey: ["public-discipline"], queryFn: () => fn() });

  return (
    <>
      <Header />
      <PageHeader eyebrow="Commission disciplinaire" title="Décisions publiées" description="Décisions disciplinaires prononcées par la direction. Publication anonymisée conformément aux règles déontologiques." />
      <main className="container-page py-12">
        <div className="mb-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-secondary/40 p-6">
          <div className="flex items-center gap-3">
            <Scale className="h-6 w-6 text-navy" />
            <div>
              <div className="font-display text-lg font-bold text-navy-deep">Vous souhaitez signaler un manquement ?</div>
              <p className="text-sm text-muted-foreground">Toute personne peut saisir la Commission disciplinaire.</p>
            </div>
          </div>
          <Button asChild className="bg-navy"><Link to="/signalement">Déposer un signalement</Link></Button>
        </div>

        {isLoading ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (data ?? []).length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">Aucune décision publiée à ce jour.</div>
        ) : (
          <div className="grid gap-4">
            {(data as any[]).map((d) => (
              <article key={d.id} className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono">{d.case_number}</span>
                    <span>•</span>
                    <span>{new Date(d.decided_at).toLocaleDateString("fr-FR")}</span>
                    <span>•</span>
                    <span>Me {d.lawyer_initials}</span>
                  </div>
                  <Badge className={TONE[d.decision] ?? ""}>{LABEL[d.decision] ?? d.decision}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-line text-sm text-foreground/90">{d.motivation}</p>
              </article>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
