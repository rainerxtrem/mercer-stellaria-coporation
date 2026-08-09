import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Bell, Building2, ChevronRight, FileCheck2, Files, MessageSquare, ReceiptText, Scale, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getClientDashboard, listClientConversations } from "@/lib/client-portal.functions";
import { listClientInsuranceModules } from "@/lib/insurance-requests.functions";

export const Route = createFileRoute("/portail-client/")({
  head: () => ({
    meta: [{ title: "Portail client - Dashboard" }],
  }),
  component: ClientPortalDashboard,
});

const numberFmt = new Intl.NumberFormat("fr-FR");

function ClientPortalDashboard() {
  const dashboardFn = useServerFn(getClientDashboard);
  const conversationsFn = useServerFn(listClientConversations);
  const modulesFn = useServerFn(listClientInsuranceModules);
  const dashboardQ = useQuery({
    queryKey: ["client-portal", "dashboard"],
    queryFn: () => dashboardFn(),
  });
  const conversationsQ = useQuery({
    queryKey: ["client-portal", "conversations"],
    queryFn: () => conversationsFn(),
  });
  const modulesQ = useQuery({
    queryKey: ["client-portal", "modules"],
    queryFn: () => modulesFn(),
  });

  const d: any = dashboardQ.data;

  if (dashboardQ.isError) {
    return (
      <section className="mx-auto w-full max-w-6xl px-5 py-16 lg:px-8">
        <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-6">
          <h1 className="font-display text-xl font-semibold text-zinc-50">Espace client temporairement indisponible</h1>
          <p className="mt-2 text-sm text-zinc-400">Vos informations n'ont pas pu être chargées. Aucun accès supplémentaire n'a été accordé.</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => dashboardQ.refetch()}>
            Réessayer
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-400">Portail client</p>
          <h1 className="font-display text-2xl font-semibold text-zinc-50">
            {d
              ? `Bienvenue ${[d.client.last_name, d.client.first_name].filter(Boolean).join(" ")}`
              : "Chargement..."}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">Vos entreprises, dossiers et échanges réunis au même endroit.</p>
        </div>
        {d?.client?.company && <Badge className="border-zinc-700 bg-zinc-800 text-zinc-200">{d.client.company}</Badge>}
      </div>

      <div className="mb-6">
        {(modulesQ.data?.modules ?? []).length > 0 && (
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {(modulesQ.data?.modules ?? []).includes("claims") && (
              <ActionBanner
                icon={ShieldAlert}
                title="Déclarer un sinistre"
                text="Lancer un dossier, déposer des pièces et suivre l'avancement."
                to="/portail-client/sinistres"
              />
            )}
            {(modulesQ.data?.modules ?? []).includes("refunds") && (
              <ActionBanner
                icon={ReceiptText}
                title="Demander un remboursement"
                text="Centraliser vos justificatifs et suivre le traitement."
                to="/portail-client/remboursements"
              />
            )}
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">Mes entreprises</p>
            <h2 className="mt-1 font-display text-lg font-semibold text-zinc-100">Contacts et services</h2>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {(conversationsQ.data?.conversations ?? []).map((conversation: any) => (
            <div key={conversation.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900/65 transition hover:border-amber-500/30 hover:shadow-lg">
              <Link
                to="/portail-client/messages"
                search={{ conversation: conversation.id, matter: "" }}
                className="flex items-center gap-3 border-b border-zinc-800 p-4 hover:bg-zinc-800/40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-300">
                  <Building2 className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-zinc-100">{conversation.firm_name}</span>
                  <span className="mt-0.5 block truncate text-xs text-zinc-500">
                    {conversation.latest_message?.body || conversation.latest_message?.attachment_name || "Ouvrir la conversation"}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-600" />
              </Link>
              <div className="grid grid-cols-4 divide-x divide-zinc-800">
                <CompanyAction to="/portail-client/dossiers" icon={Scale} label="Dossiers" />
                <CompanyAction to="/portail-client/documents" icon={Files} label="Documents" />
                <CompanyAction to="/portail-client/signatures" icon={ReceiptText} label="Factures" />
                <CompanyAction to="/portail-client/signatures" icon={FileCheck2} label="Signatures" />
              </div>
            </div>
          ))}
        </div>
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

function CompanyAction({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="flex min-w-0 flex-col items-center gap-1 px-1 py-3 text-[10px] text-zinc-500 transition hover:bg-zinc-800/50 hover:text-amber-300">
      <Icon className="h-4 w-4" />
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}

function ActionBanner({ icon: Icon, title, text, to }: { icon: any; title: string; text: string; to: string }) {
  return (
    <Link to={to} className="group rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-4 transition hover:border-amber-500/40 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-300 transition group-hover:scale-105">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-zinc-100">{title}</span>
          <span className="mt-1 block text-xs text-zinc-500">{text}</span>
        </span>
      </div>
    </Link>
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
