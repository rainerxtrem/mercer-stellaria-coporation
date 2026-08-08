import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listClientNotifications, markClientNotificationsRead } from "@/lib/client-portal.functions";

export const Route = createFileRoute("/portail-client/notifications")({
  head: () => ({
    meta: [{ title: "Portail client - Notifications" }],
  }),
  component: ClientPortalNotificationsPage,
});

function ClientPortalNotificationsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listClientNotifications);
  const markFn = useServerFn(markClientNotificationsRead);

  const notifQ = useQuery({
    queryKey: ["client-portal", "notifications"],
    queryFn: () => listFn(),
  });

  const markAll = useMutation({
    mutationFn: () => markFn({ data: { ids: null } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["client-portal", "notifications"] });
      await qc.invalidateQueries({ queryKey: ["client-portal", "dashboard"] });
    },
  });

  return (
    <section className="mx-auto w-full max-w-6xl px-5 py-8 lg:px-8">
      <Card className="border-zinc-800 bg-zinc-900/65">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-zinc-100">Notifications</CardTitle>
          <Button variant="outline" className="border-zinc-700 bg-transparent text-zinc-100" onClick={() => markAll.mutate()}>
            Tout marquer comme lu
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {(notifQ.data ?? []).length === 0 && <p className="text-sm text-zinc-400">Aucune notification.</p>}
          {(notifQ.data ?? []).map((notif: any) => (
            <div key={notif.id} className={`rounded-xl border p-4 text-sm ${notif.read_at ? "border-zinc-800 bg-zinc-950/60" : "border-amber-500/40 bg-amber-500/10"}`}>
              <p className="font-medium text-zinc-100">{notif.title}</p>
              {notif.body && <p className="mt-1 text-zinc-300">{notif.body}</p>}
              <p className="mt-2 text-xs text-zinc-500">{new Date(notif.created_at).toLocaleString("fr-FR")}</p>
              {notif.link && (
                <p className="mt-2 text-xs">
                  <Link to={notif.link as any} className="text-amber-300 underline">Ouvrir la page liee</Link>
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
