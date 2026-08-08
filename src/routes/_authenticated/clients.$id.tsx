import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getClient } from "@/lib/clients.functions";
import { listInvoices } from "@/lib/invoices.functions";
import { ArrowLeft, ExternalLink, Folder, FileSignature, Receipt, Mail, Phone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  head: () => ({ meta: [{ title: "Fiche client — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getClientFn = useServerFn(getClient);
  const listInvoicesFn = useServerFn(listInvoices);

  const clientQ = useQuery({ queryKey: ["client", id], queryFn: () => getClientFn({ data: { id } }) });
  const quotesQ = useQuery({ queryKey: ["invoices", "client", id, "quote"], queryFn: () => listInvoicesFn({ data: { client_id: id, kind: "quote" } }) });
  const invoicesQ = useQuery({ queryKey: ["invoices", "client", id, "invoice"], queryFn: () => listInvoicesFn({ data: { client_id: id, kind: "invoice" } }) });

  const c: any = clientQ.data?.client;
  const matters: any[] = clientQ.data?.matters ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Client"
        title={c ? `${(c.last_name ?? "").toUpperCase()} ${c.first_name ?? ""}`.trim() : "Chargement…"}
        description={c?.email ?? undefined}
      >
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/clients" })} className="border-white text-white hover:bg-white hover:text-navy">
          <ArrowLeft className="mr-1.5 h-4 w-4" />Retour
        </Button>
      </PageHeader>

      <section className="container-page py-8 space-y-6">
        {c && (
          <Card className="shadow-[var(--shadow-card)]">
            <CardContent className="p-6 grid gap-3 sm:grid-cols-2 text-sm">
              {c.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />{c.email}</div>}
              {c.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{c.phone}</div>}
              {c.address && <div className="sm:col-span-2 text-muted-foreground">{c.address}</div>}
              {c.notes && <div className="sm:col-span-2 whitespace-pre-line text-muted-foreground">{c.notes}</div>}
              <div className="sm:col-span-2 text-xs text-muted-foreground">
                Créé par {(c as any).owner_name ?? "—"}
                {(c as any).updated_by_name ? ` · Dernière modification par ${(c as any).updated_by_name}` : ""}
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
