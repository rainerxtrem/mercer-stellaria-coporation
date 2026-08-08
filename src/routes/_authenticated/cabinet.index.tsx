import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyFirm, getFirmStats } from "@/lib/firm-admin.functions";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, FolderOpen, FileText, Wallet, UserSquare2, FileSpreadsheet, Handshake, Activity } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cabinet/")({
  head: () => ({ meta: [{ title: "Dashboard Cabinet — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

function Page() {
  const getFirm = useServerFn(getMyFirm);
  const getStats = useServerFn(getFirmStats);
  const [firm, setFirm] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [f, s] = await Promise.all([getFirm(), getStats()]);
        setFirm(f); setStats(s);
      } catch (e: any) { setErr(e?.message ?? "Erreur"); }
    })();
  }, []);

  if (err) return <div className="p-8"><PageHeader eyebrow="Cabinet" title="Portail Cabinet" description={err} /></div>;
  if (!firm || !stats) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const cards = [
    { label: "Avocats actifs", value: `${stats.members_active} / ${stats.members_total}`, icon: Users },
    { label: "Assistants", value: stats.assistants_total ?? 0, icon: UserSquare2 },
    { label: "Clients", value: stats.clients_total ?? 0, icon: Handshake },
    { label: "Dossiers ouverts", value: `${stats.matters_open} / ${stats.matters_total}`, icon: FolderOpen },
    { label: "Devis émis", value: stats.quotes_total ?? 0, icon: FileSpreadsheet },
    { label: "Factures émises", value: stats.invoices_total, icon: FileText },
    { label: "CA encaissé", value: `${Number(stats.revenue_paid ?? 0).toLocaleString("fr-FR")} $`, icon: Wallet },
    { label: "En attente", value: `${Number(stats.revenue_pending ?? 0).toLocaleString("fr-FR")} $`, icon: Wallet },
  ];

  const monthly: Array<{ month: string; revenue: number; matters: number }> = stats.monthly ?? [];
  const maxRev = Math.max(1, ...monthly.map((m) => m.revenue));
  const maxMatters = Math.max(1, ...monthly.map((m) => m.matters));

  return (
    <div className="space-y-6 p-6">
      <PageHeader eyebrow="Direction de cabinet" title={firm.name} description={firm.address ?? "Cabinet enregistré au Mercer & Stellaria Corporation"} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="h-4 w-4 text-gold" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold text-navy-deep">{c.value}</div></CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Activité mensuelle (6 derniers mois)</CardTitle></CardHeader>
          <CardContent>
            {monthly.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune donnée sur la période.</p>
            ) : (
              <div className="flex items-end justify-between gap-2 h-40">
                {monthly.map((m) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-32 w-full items-end gap-1">
                      <div className="flex-1 rounded-t bg-navy" style={{ height: `${(m.revenue / maxRev) * 100}%` }} title={`CA: ${m.revenue.toFixed(0)} $`} />
                      <div className="flex-1 rounded-t bg-gold" style={{ height: `${(m.matters / maxMatters) * 100}%` }} title={`Dossiers: ${m.matters}`} />
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m.month.slice(5)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-navy" />CA encaissé</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-gold" />Dossiers ouverts</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-gold" />Activité récente</CardTitle></CardHeader>
          <CardContent>
            {(stats.recent ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune activité enregistrée.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(stats.recent ?? []).map((r: any) => (
                  <li key={r.id} className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-none">
                    <div className="min-w-0">
                      <div className="font-medium text-navy-deep">{r.summary ?? `${r.entity_type} · ${r.action}`}</div>
                      <div className="text-xs text-muted-foreground">{r.entity_type} · {r.action}</div>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString("fr-FR")}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
