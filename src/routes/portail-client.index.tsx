import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bell, FileCheck2, Files, MessageSquare, Scale } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getClientDashboard } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/portail-client/")({
  head: () => ({
    meta: [{ title: "Portail client - Dashboard" }],
  }),
  component: ClientPortalDashboard,
});

const numberFmt = new Intl.NumberFormat("fr-FR");

function ClientPortalDashboard() {
  const dashboardFn = useServerFn(getClientDashboard);
  const dashboardQ = useQuery({
    queryKey: ["client-portal", "dashboard"],
    queryFn: () => dashboardFn(),
  });

  const d: any = dashboardQ.data;

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Portail client</p>
          <h1 className="font-display text-2xl font-semibold text-zinc-50">
            {d ? `Bienvenue ${d.client.first_name ?? ""}` : "Chargement"}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Espace isole pour le suivi de vos dossiers et documents.</p>
        </div>
        {d?.client?.company && <Badge className="border-zinc-700 bg-zinc-800 text-zinc-200">{d.client.company}</Badge>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Scale} label="Dossiers actifs" value={numberFmt.format(d?.matters_open ?? 0)} />
        <MetricCard icon={Files} label="Documents" value={numberFmt.format(d?.documents_total ?? 0)} />
        <MetricCard icon={FileCheck2} label="A signer" value={numberFmt.format(d?.to_sign ?? 0)} />
        <MetricCard icon={MessageSquare} label="Messages non lus" value={numberFmt.format(d?.messages_unread ?? 0)} />
        <MetricCard icon={Bell} label="Notifications" value={numberFmt.format(d?.notifications_unread ?? 0)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Derniers dossiers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(d?.recent_matters ?? []).length === 0 && <p className="text-zinc-400">Aucun dossier partage pour le moment.</p>}
            {(d?.recent_matters ?? []).map((matter: any) => (
              <Link
                key={matter.id}
                to="/portail-client/dossiers/$matterId"
                params={{ matterId: matter.id }}
                className="block rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 hover:border-amber-500/40"
              >
                <p className="text-xs text-zinc-400">{matter.number ?? "Dossier"}</p>
                <p className="font-medium text-zinc-100">{matter.title}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/60">
          <CardHeader>
            <CardTitle className="text-zinc-100">Messages recents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(d?.recent_messages ?? []).length === 0 && <p className="text-zinc-400">Aucun message recent.</p>}
            {(d?.recent_messages ?? []).map((message: any) => (
              <div key={message.id} className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
                <p className="line-clamp-2 text-zinc-200">{message.body}</p>
                <p className="mt-1 text-xs text-zinc-500">{new Date(message.created_at).toLocaleString("fr-FR")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/70">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">{label}</p>
          <Icon className="h-4 w-4 text-amber-300" />
        </div>
        <p className="mt-3 text-2xl font-semibold text-zinc-100">{value}</p>
      </CardContent>
    </Card>
  );
}
