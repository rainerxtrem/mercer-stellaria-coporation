import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getClient } from "@/lib/clients.functions";
import { listInvoices } from "@/lib/invoices.functions";
import { linkClientDiscord, setClientDiscordChannel, unlinkClientDiscord } from "@/lib/client-accounts.functions";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Folder, FileSignature, Receipt, Phone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Fiche client — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getClientFn = useServerFn(getClient);
  const listInvoicesFn = useServerFn(listInvoices);
  const linkDiscordFn = useServerFn(linkClientDiscord);
  const unlinkDiscordFn = useServerFn(unlinkClientDiscord);
  const setChannelFn = useServerFn(setClientDiscordChannel);

  const clientQ = useQuery({ queryKey: ["client", id], queryFn: () => getClientFn({ data: { id } }) });
  const quotesQ = useQuery({ queryKey: ["invoices", "client", id, "quote"], queryFn: () => listInvoicesFn({ data: { client_id: id, kind: "quote" } }) });
  const invoicesQ = useQuery({ queryKey: ["invoices", "client", id, "invoice"], queryFn: () => listInvoicesFn({ data: { client_id: id, kind: "invoice" } }) });

  const c: any = clientQ.data?.client;
  const matters: any[] = clientQ.data?.matters ?? [];
  const [discordUserId, setDiscordUserId] = useState("");
  const [discordUsername, setDiscordUsername] = useState("");
  const [discordChannelId, setDiscordChannelId] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");

  useEffect(() => {
    setDiscordUserId(c?.discord_user_id ?? "");
    setDiscordUsername(c?.discord_username ?? "");
    setDiscordChannelId(c?.discord_channel_id ?? "");
    setDiscordWebhookUrl(c?.discord_webhook_url ?? "");
  }, [c?.id, c?.discord_user_id, c?.discord_username, c?.discord_channel_id, c?.discord_webhook_url]);

  const saveIdentity = useMutation({
    mutationFn: () =>
      linkDiscordFn({
        data: {
          client_id: id,
          discord_user_id: discordUserId.trim(),
          discord_username: discordUsername.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Compte Discord lie");
      await qc.invalidateQueries({ queryKey: ["client", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveChannel = useMutation({
    mutationFn: () =>
      setChannelFn({
        data: {
          client_id: id,
          discord_channel_id: discordChannelId.trim() || null,
          discord_webhook_url: discordWebhookUrl.trim() || null,
        },
      }),
    onSuccess: async () => {
      toast.success("Configuration Discord enregistree");
      await qc.invalidateQueries({ queryKey: ["client", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const unlink = useMutation({
    mutationFn: () => unlinkDiscordFn({ data: { client_id: id } }),
    onSuccess: async () => {
      toast.success("Liaison Discord retiree");
      await qc.invalidateQueries({ queryKey: ["client", id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        eyebrow="Client"
        title={c ? `${(c.last_name ?? "").toUpperCase()} ${c.first_name ?? ""}`.trim() : "Chargement…"}
      >
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/clients" })} className="border-white text-white hover:bg-white hover:text-navy">
          <ArrowLeft className="mr-1.5 h-4 w-4" />Retour
        </Button>
      </PageHeader>

      <section className="container-page py-8 space-y-6">
        {c && (
          <Card className="shadow-[var(--shadow-card)]">
            <CardContent className="p-6 grid gap-3 sm:grid-cols-2 text-sm">
              {c.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{c.phone}</div>}
              {c.address && <div className="sm:col-span-2 text-muted-foreground">{c.address}</div>}
              {c.notes && <div className="sm:col-span-2 whitespace-pre-line text-muted-foreground">{c.notes}</div>}
              <div className="sm:col-span-2 text-xs text-muted-foreground">
                Créé par {(c as any).owner_name ?? "—"}
                {(c as any).updated_by_name ? ` · Dernière modification par ${(c as any).updated_by_name}` : ""}
              </div>

              <div className="sm:col-span-2 mt-3 rounded-lg border border-border bg-muted/35 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Portail client Discord</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="discord-user-id">Discord User ID</Label>
                    <Input
                      id="discord-user-id"
                      value={discordUserId}
                      onChange={(e) => setDiscordUserId(e.target.value)}
                      placeholder="Ex: 123456789012345678"
                    />
                  </div>
                  <div>
                    <Label htmlFor="discord-username">Discord Username</Label>
                    <Input
                      id="discord-username"
                      value={discordUsername}
                      onChange={(e) => setDiscordUsername(e.target.value)}
                      placeholder="Pseudo Discord"
                    />
                  </div>
                  <div>
                    <Label htmlFor="discord-channel-id">Discord Channel ID</Label>
                    <Input
                      id="discord-channel-id"
                      value={discordChannelId}
                      onChange={(e) => setDiscordChannelId(e.target.value)}
                      placeholder="Canal prive client"
                    />
                  </div>
                  <div>
                    <Label htmlFor="discord-webhook-url">Discord Webhook URL</Label>
                    <Input
                      id="discord-webhook-url"
                      value={discordWebhookUrl}
                      onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                      placeholder="https://discord.com/api/webhooks/..."
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => saveIdentity.mutate()}
                    disabled={!discordUserId.trim() || saveIdentity.isPending}
                    className="bg-navy text-white hover:bg-navy-deep"
                  >
                    Lier le compte Discord
                  </Button>
                  <Button
                    onClick={() => saveChannel.mutate()}
                    disabled={saveChannel.isPending}
                    variant="outline"
                  >
                    Enregistrer canal/webhook
                  </Button>
                  <Button
                    onClick={() => unlink.mutate()}
                    disabled={unlink.isPending}
                    variant="destructive"
                  >
                    Delier Discord
                  </Button>
                </div>
              </div>

            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="matters">
          <TabsList>
            <TabsTrigger value="matters"><Folder className="mr-1.5 h-4 w-4" />Dossiers</TabsTrigger>
            <TabsTrigger value="quotes"><FileSignature className="mr-1.5 h-4 w-4" />Devis</TabsTrigger>
            <TabsTrigger value="invoices"><Receipt className="mr-1.5 h-4 w-4" />Factures</TabsTrigger>
          </TabsList>

          <TabsContent value="matters" className="mt-4">
            <Card className="shadow-[var(--shadow-card)]"><CardContent className="p-4">
              {matters.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Aucun dossier rattaché.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {matters.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className="font-mono text-xs text-muted-foreground w-32 shrink-0">{m.number}</span>
                      <span className="flex-1 truncate font-medium">{m.title}</span>
                      <span className="text-xs text-muted-foreground">{m.status}</span>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/dossiers/$matterId" params={{ matterId: m.id }}><ExternalLink className="h-4 w-4" /></Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent></Card>
          </TabsContent>

          {(["quote", "invoice"] as const).map((k) => {
            const q = k === "quote" ? quotesQ : invoicesQ;
            return (
              <TabsContent key={k} value={k === "quote" ? "quotes" : "invoices"} className="mt-4">
                <Card className="shadow-[var(--shadow-card)]"><CardContent className="p-4">
                  {((q.data ?? []) as any[]).length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">Aucun document.</div>
                  ) : (
                    <ul className="divide-y divide-border">
                      {((q.data ?? []) as any[]).map((inv) => (
                        <li key={inv.id} className="flex items-center gap-3 py-2 text-sm">
                          <span className="font-mono text-xs text-muted-foreground w-32 shrink-0">{inv.number}</span>
                          <span className="flex-1 truncate">{inv.issue_date}</span>
                          <span className="font-mono font-semibold w-28 text-right">{Number(inv.total).toFixed(2)} {inv.currency}</span>
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/facturation/$id" params={{ id: inv.id }}><ExternalLink className="h-4 w-4" /></Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent></Card>
              </TabsContent>
            );
          })}
        </Tabs>
      </section>
    </>
  );
}
