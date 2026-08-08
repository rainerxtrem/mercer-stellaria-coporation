import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyDashboard } from "@/lib/dashboard.functions";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FolderOpen, Users, FileText, Wallet, AlertTriangle, TrendingUp,
  Clock, ChevronRight, Activity, Plus,
} from "lucide-react";
import { matterStatusMeta } from "@/lib/matter-status";

export const Route = createFileRoute("/_authenticated/tableau-de-bord")({
  head: () => ({ meta: [{ title: "Tableau de bord — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

function Page() {
  const fn = useServerFn(getMyDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: () => fn({ data: undefined as any }) });

  return (
    <>
      <PageHeader
        eyebrow="Espace Avocat"
        title="Tableau de bord"
        description="Vue d'ensemble de votre activité professionnelle : dossiers, clients, facturation."
      />
      <section className="container-page py-10 space-y-8">
        {isLoading || !data ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse"><CardContent className="h-28" /></Card>
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">

              <StatCard
                icon={FolderOpen}
                label="Dossiers en cours"
                value={data.stats.mattersOpen}
                sub={`${data.stats.mattersTotal} au total`}
                to="/dossiers"
                accent="navy"
              />
              <StatCard
                icon={Clock}
                label="Dossiers en instance"
                value={data.stats.mattersInstance ?? 0}
                sub={`${data.stats.mattersPending ?? 0} en attente`}
                to="/dossiers"
                accent="navy"
              />
              <StatCard
                icon={Users}
                label="Clients"
                value={data.stats.clientsTotal}
                sub="Répertoire personnel"
                to="/clients"
                accent="navy"
              />
              <StatCard
                icon={Wallet}
                label="En attente de paiement"
                value={fmtMoney(data.stats.invoicesOutstanding)}
                sub={`${data.stats.invoicesOverdue} facture(s) en retard`}
                to="/facturation"
                accent={data.stats.invoicesOverdue > 0 ? "danger" : "gold"}
              />
              <StatCard
                icon={TrendingUp}
                label="Encaissé"
                value={fmtMoney(data.stats.invoicesCollected)}
                sub={`${data.stats.quotesSent} devis envoyés`}
                to="/facturation"
                accent="gold"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2 shadow-[var(--shadow-card)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold text-navy-deep">Dossiers récents</h3>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/dossiers">Tous <ChevronRight className="ml-1 h-4 w-4" /></Link>
                    </Button>
                  </div>
                  {data.recentMatters.length === 0 ? (
                    <EmptyRow label="Aucun dossier pour l'instant" cta="Créer un dossier" to="/dossiers" />
                  ) : (
                    <ul className="mt-4 divide-y divide-border">
                      {data.recentMatters.map((m: any) => (
                        <li key={m.id}>
                          <Link
                            to="/dossiers/$matterId"
                            params={{ matterId: m.id }}
                            className="flex items-center gap-3 py-3 hover:bg-secondary/50 rounded-md px-2 -mx-2 transition-colors"
                          >
                            <FolderOpen className="h-4 w-4 text-navy" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-navy-deep truncate">{m.title}</div>
                              <div className="text-xs text-muted-foreground">{m.number}</div>
                            </div>
                            <MatterStatusBadge status={m.status} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-[var(--shadow-card)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold text-navy-deep">Échéances</h3>
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {data.upcomingInvoices.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">Aucune facture à échéance prochaine.</p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {data.upcomingInvoices.map((i: any) => (
                        <li key={i.id}>
                          <Link
                            to="/facturation/$id"
                            params={{ id: i.id }}
                            className="flex items-center justify-between gap-2 rounded-md border border-border p-3 hover:bg-secondary/50"
                          >
                            <div className="min-w-0">
                              <div className="font-mono text-xs text-navy">{i.number}</div>
                              <div className="text-xs text-muted-foreground">Échéance {i.due_date}</div>
                            </div>
                            <div className="text-sm font-semibold text-navy-deep">{fmtMoney(Number(i.total))}</div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 shadow-[var(--shadow-card)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold text-navy-deep">Facturation récente</h3>
                    <Button asChild variant="ghost" size="sm">
                      <Link to="/facturation">Voir tout <ChevronRight className="ml-1 h-4 w-4" /></Link>
                    </Button>
                  </div>
                  {data.recentInvoices.length === 0 ? (
                    <EmptyRow label="Aucun document financier" cta="Créer un devis" to="/facturation" />
                  ) : (
                    <ul className="mt-4 divide-y divide-border">
                      {data.recentInvoices.map((i: any) => (
                        <li key={i.id}>
                          <Link
                            to="/facturation/$id"
                            params={{ id: i.id }}
                            className="flex items-center gap-3 py-3 hover:bg-secondary/50 rounded-md px-2 -mx-2"
                          >
                            <FileText className="h-4 w-4 text-navy" />
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-sm text-navy-deep">{i.number}</div>
                              <div className="text-xs text-muted-foreground">
                                {i.kind === "quote" ? "Devis" : "Facture"} · {i.issue_date}
                              </div>
                            </div>
                            <InvoiceStatusBadge status={i.status} />
                            <div className="text-sm font-semibold text-navy-deep w-24 text-right">
                              {fmtMoney(Number(i.total))}
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="shadow-[var(--shadow-card)]">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-lg font-bold text-navy-deep">Activité</h3>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  {data.activity.length === 0 ? (
                    <p className="mt-4 text-sm text-muted-foreground">Aucune activité récente.</p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {data.activity.map((a: any) => (
                        <li key={a.id} className="text-sm">
                          <div className="text-navy-deep">{a.summary}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(a.created_at).toLocaleString("fr-FR")}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>
    </>
  );
}

function StatCard({
  icon: Icon, label, value, sub, to, accent,
}: {
  icon: any; label: string; value: string | number; sub?: string; to: string;
  accent: "navy" | "gold" | "danger";
}) {
  const iconClass =
    accent === "danger" ? "bg-red-50 text-red-600"
      : accent === "gold" ? "bg-gold/10 text-gold"
      : "bg-navy/5 text-navy";
  return (
    <Link to={to} className="block">
      <Card className="h-full shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elegant)]">
        <CardContent className="flex items-start gap-4 p-5">
          <div className={`grid h-11 w-11 place-items-center rounded-lg ${iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 font-display text-2xl font-bold text-navy-deep truncate">{value}</div>
            {sub && <div className="mt-1 text-xs text-muted-foreground truncate">{sub}</div>}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyRow({ label, cta, to }: { label: string; cta: string; to: string }) {
  return (
    <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-8 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Button asChild size="sm" className="bg-navy hover:bg-navy-deep">
        <Link to={to}><Plus className="mr-1.5 h-4 w-4" />{cta}</Link>
      </Button>
    </div>
  );
}

function MatterStatusBadge({ status }: { status: string }) {
  const s = matterStatusMeta(status);
  return <Badge className={`${s.badge} border-0`} variant="secondary">{s.label}</Badge>;
}


function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    draft: { label: "Brouillon", className: "bg-secondary text-secondary-foreground" },
    sent: { label: "Envoyé", className: "bg-info/15 text-info" },
    accepted: { label: "Accepté", className: "bg-success/15 text-success" },
    refused: { label: "Refusé", className: "bg-destructive/15 text-destructive" },
    partial: { label: "Partiel", className: "bg-warning/15 text-warning" },
    paid: { label: "Payé", className: "bg-success/15 text-success" },
    overdue: { label: "En retard", className: "bg-destructive/15 text-destructive" },
    cancelled: { label: "Annulé", className: "bg-muted text-muted-foreground" },
    converted: { label: "Converti", className: "bg-muted text-muted-foreground" },
  };
  const s = map[status] ?? { label: status, className: "bg-secondary text-secondary-foreground" };
  return <Badge className={`${s.className} border-0`} variant="secondary">{s.label}</Badge>;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
