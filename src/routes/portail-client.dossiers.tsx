import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listClientMattersPortal } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/portail-client/dossiers")({
  head: () => ({
    meta: [{ title: "Portail client - Dossiers" }],
  }),
  component: ClientPortalMattersPage,
});

function ClientPortalMattersPage() {
  const listFn = useServerFn(listClientMattersPortal);
  const mattersQ = useQuery({ queryKey: ["client-portal", "matters"], queryFn: () => listFn() });

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <Card className="border-zinc-800 bg-zinc-900/65">
        <CardHeader>
          <CardTitle className="text-zinc-100">Mes dossiers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(mattersQ.data ?? []).length === 0 && (
            <p className="text-sm text-zinc-400">Aucun dossier partage avec votre compte.</p>
          )}
          {(mattersQ.data ?? []).map((matter: any) => (
            <Link
              key={matter.id}
              to="/portail-client/dossiers/$matterId"
              params={{ matterId: matter.id }}
              className="block rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 transition hover:border-amber-500/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-zinc-400">{matter.number ?? "Dossier"}</p>
                  <p className="text-sm font-medium text-zinc-100">{matter.title}</p>
                </div>
                <Badge className="border-zinc-700 bg-zinc-800 text-zinc-200">{matter.status}</Badge>
              </div>
              {matter.owner_name && (
                <p className="mt-2 text-xs text-zinc-500">Referent: {matter.owner_name}</p>
              )}
            </Link>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
