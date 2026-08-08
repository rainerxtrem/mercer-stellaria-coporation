import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ClientMatterPicker, type PickerValue } from "@/components/app/ClientMatterPicker";
import { listInvoices, createInvoice, deleteInvoice } from "@/lib/invoices.functions";
import { toast } from "sonner";
import { Plus, Trash2, FileText, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/facturation/")({
  head: () => ({ meta: [{ title: "Facturation — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Brouillon", cls: "bg-secondary text-secondary-foreground" },
  sent: { label: "Envoyé", cls: "bg-info/15 text-info" },
  accepted: { label: "Accepté", cls: "bg-success/15 text-success" },
  refused: { label: "Refusé", cls: "bg-destructive/15 text-destructive" },
  paid: { label: "Payé", cls: "bg-success/15 text-success" },
  partial: { label: "Partiel", cls: "bg-warning/15 text-warning" },
  overdue: { label: "En retard", cls: "bg-destructive/15 text-destructive" },
  cancelled: { label: "Annulé", cls: "bg-muted text-muted-foreground" },
  converted: { label: "Converti", cls: "bg-info/15 text-info" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABELS[status] ?? STATUS_LABELS.draft;
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

function Page() {
  const [kind, setKind] = useState<"quote" | "invoice">("quote");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [picker, setPicker] = useState<PickerValue>({ client_id: null, matter_id: null });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const listFn = useServerFn(listInvoices);
  const createFn = useServerFn(createInvoice);
  const deleteFn = useServerFn(deleteInvoice);

  const invoices = useQuery({
    queryKey: ["invoices", kind, status, search],
    queryFn: () => listFn({ data: { kind, status, search } }),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          kind,
          client_id: picker.client_id,
          matter_id: picker.matter_id,
          currency: "USD",
          tax_rate: 0,
          items: [{ label: "Nouvelle prestation", quantity: 1, unit_price: 0 }],
        },
      }),
    onSuccess: (r: any) => {
      toast.success(`${kind === "quote" ? "Devis" : "Facture"} ${r.number} créé`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setDialogOpen(false);
      setPicker({ client_id: null, matter_id: null });
      navigate({ to: "/facturation/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Supprimé"); qc.invalidateQueries({ queryKey: ["invoices"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader eyebrow="Espace Avocat" title="Facturation" description="Émettez et suivez vos devis et factures avec vérification d'authenticité." />
      <section className="container-page py-10">
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <Tabs value={kind} onValueChange={(v) => setKind(v as "quote" | "invoice")}>
                <TabsList>
                  <TabsTrigger value="quote">Devis</TabsTrigger>
                  <TabsTrigger value="invoice">Factures</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-1 gap-2 sm:justify-end">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° document…" className="pl-9" />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  className="bg-navy text-white hover:bg-navy-deep"
                  onClick={() => { setPicker({ client_id: null, matter_id: null }); setDialogOpen(true); }}
                >
                  <Plus className="mr-1.5 h-4 w-4" />Nouveau {kind === "quote" ? "devis" : "facture"}
                </Button>
              </div>
            </div>

            <div className="mt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Émis le</TableHead>
                    <TableHead>Échéance</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(invoices.data ?? []).map((inv: any) => {
                    const cs = inv.client_snapshot ?? {};
                    const cn = [cs.first_name, cs.last_name].filter(Boolean).join(" ") || "—";
                    return (
                      <TableRow key={inv.id} className="cursor-pointer" onClick={() => navigate({ to: "/facturation/$id", params: { id: inv.id } })}>
                        <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                        <TableCell>{cn}</TableCell>
                        <TableCell>{inv.issue_date}</TableCell>
                        <TableCell>{inv.due_date ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{Number(inv.total).toFixed(2)} {inv.currency}</TableCell>
                        <TableCell><StatusBadge status={inv.status} /></TableCell>
                        <TableCell className="text-right">
                          {inv.status === "draft" && (
                            <Button size="icon" variant="ghost"
                              onClick={(e) => { e.stopPropagation(); if (confirm(`Supprimer ${inv.number} ?`)) del.mutate(inv.id); }}
                              aria-label="Supprimer">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(invoices.data ?? []).length === 0 && !invoices.isLoading && (
                    <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      Aucun document. Créez votre premier {kind === "quote" ? "devis" : "facture"}.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nouveau {kind === "quote" ? "devis" : "facture"}</DialogTitle>
            <DialogDescription>
              Sélectionnez un client existant et, si nécessaire, un dossier à rattacher. Le document sera automatiquement lié à la fiche client et à la fiche dossier.
            </DialogDescription>
          </DialogHeader>
          <ClientMatterPicker value={picker} onChange={setPicker} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button
              disabled={!picker.client_id || create.isPending}
              onClick={() => create.mutate()}
              className="bg-navy text-white hover:bg-navy-deep"
            >
              Créer et éditer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
