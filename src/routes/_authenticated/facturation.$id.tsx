import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getInvoice, updateInvoice, setInvoiceStatus, convertQuoteToInvoice,
  recordPayment, renderInvoicePdf,
} from "@/lib/invoices.functions";
import { LEGAL_SERVICES } from "@/lib/legal-services";
import { listFirmPricing } from "@/lib/firm-pricing.functions";
import { ClientMatterPicker, type PickerValue } from "@/components/app/ClientMatterPicker";
import { SignaturePanel } from "@/components/app/SignaturePanel";

import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2, Download, Send, CheckCircle2, RefreshCcw, DollarSign, ArrowLeft, QrCode, User, Folder, ExternalLink } from "lucide-react";

export const Route = createFileRoute("/_authenticated/facturation/$id")({
  head: () => ({ meta: [{ title: "Document — Facturation" }] }),
  component: Page,
});

type Item = { label: string; description?: string; quantity: number; unit_price: number };

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

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getInvoice);
  const updateFn = useServerFn(updateInvoice);
  const statusFn = useServerFn(setInvoiceStatus);
  const convertFn = useServerFn(convertQuoteToInvoice);
  const payFn = useServerFn(recordPayment);
  const pdfFn = useServerFn(renderInvoicePdf);

  const invoice = useQuery({ queryKey: ["invoice", id], queryFn: () => getFn({ data: { id } }) });
  const pricingFn = useServerFn(listFirmPricing);
  const pricingQ = useQuery({ queryKey: ["firm-pricing", "self"], queryFn: () => pricingFn({ data: {} }) });
  const firmPricing = (pricingQ.data ?? []).filter((p: any) => p.active) as Array<{ id: string; service: string; price: number; description: string | null }>;
  const services = firmPricing.length > 0
    ? firmPricing.map((p) => ({ label: p.service, price: Number(p.price), note: p.description ?? undefined }))
    : LEGAL_SERVICES;
  const usingFirmPricing = firmPricing.length > 0;

  const [items, setItems] = useState<Item[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [picker, setPicker] = useState<PickerValue>({ client_id: null, matter_id: null });
  const [payOpen, setPayOpen] = useState(false);
  const [pay, setPay] = useState({ amount: 0, method: "transfer", reference: "" });

  useEffect(() => {
    if (invoice.data) {
      const inv: any = invoice.data;
      setItems((inv.items ?? []).map((it: any) => ({
        label: it.label, description: it.description ?? "",
        quantity: Number(it.quantity), unit_price: Number(it.unit_price),
      })));
      setTaxRate(Number(inv.tax_rate));
      setDueDate(inv.due_date ?? "");
      setNotes(inv.notes ?? "");
      setTerms(inv.terms ?? "");
      setPicker({ client_id: inv.client_id ?? null, matter_id: inv.matter_id ?? null });
    }
  }, [invoice.data]);

  const inv: any = invoice.data;
  const locked = inv && ["paid", "cancelled", "converted"].includes(inv.status);
  const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const taxAmount = (subtotal * taxRate) / 100;
  const total = subtotal + taxAmount;

  const save = useMutation({
    mutationFn: () => updateFn({
      data: {
        id,
        items: items.map((it) => ({ ...it, description: it.description || null })),
        tax_rate: taxRate,
        due_date: dueDate || null,
        notes: notes || null,
        terms: terms || null,
        client_id: picker.client_id,
        matter_id: picker.matter_id,
      },
    }),
    onSuccess: () => {
      toast.success("Enregistré");
      qc.invalidateQueries({ queryKey: ["invoice", id] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["client"] });
      qc.invalidateQueries({ queryKey: ["matter"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeStatus = useMutation({
    mutationFn: (status: string) => statusFn({ data: { id, status } }),
    onSuccess: () => { toast.success("Statut mis à jour"); qc.invalidateQueries({ queryKey: ["invoice", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const convert = useMutation({
    mutationFn: () => convertFn({ data: { id } }),
    onSuccess: (r: any) => { toast.success(`Facture ${r.number} créée`); qc.invalidateQueries({ queryKey: ["invoices"] }); navigate({ to: "/facturation/$id", params: { id: r.id } }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const recPay = useMutation({
    mutationFn: () => payFn({ data: { invoice_id: id, amount: pay.amount, method: pay.method, reference: pay.reference || undefined } }),
    onSuccess: () => { toast.success("Paiement enregistré"); setPayOpen(false); setPay({ amount: 0, method: "transfer", reference: "" }); qc.invalidateQueries({ queryKey: ["invoice", id] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const download = useMutation({
    mutationFn: () => pdfFn({ data: { id, origin: window.location.origin } }),
    onSuccess: (r: any) => {
      const bin = atob(r.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!inv) return <div className="container-page py-20 text-center text-muted-foreground">Chargement…</div>;
  const s = STATUS_LABELS[inv.status] ?? STATUS_LABELS.draft;
  const verifyUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/verification/facture/${inv.public_token}`;

  return (
    <>
      <PageHeader
        eyebrow={inv.kind === "quote" ? "Devis" : "Facture"}
        title={inv.number}
        description={`${inv.client_snapshot?.first_name ?? ""} ${inv.client_snapshot?.last_name ?? ""}`.trim() || "Sans client"}
      />
      <section className="container-page py-8">
        <Button variant="ghost" onClick={() => navigate({ to: "/facturation" })} className="mb-4">
          <ArrowLeft className="mr-1.5 h-4 w-4" />Retour
        </Button>
        <p className="mb-4 text-xs text-muted-foreground">
          Créé par {(inv as any).owner_name ?? "—"}
          {(inv as any).updated_by_name ? ` · Dernière modification par ${(inv as any).updated_by_name}` : ""}
          {inv.updated_at ? ` le ${new Date(inv.updated_at).toLocaleString("fr-FR")}` : ""}
        </p>


        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>
          {!locked && (
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="bg-navy text-white">Enregistrer</Button>
          )}
          {inv.status === "draft" && (
            <Button size="sm" variant="outline" onClick={() => changeStatus.mutate("sent")}><Send className="mr-1.5 h-4 w-4" />Envoyer</Button>
          )}
          {inv.kind === "quote" && inv.status === "sent" && (
            <>
              <Button size="sm" variant="outline" onClick={() => changeStatus.mutate("accepted")}><CheckCircle2 className="mr-1.5 h-4 w-4" />Accepté</Button>
              <Button size="sm" variant="outline" onClick={() => changeStatus.mutate("refused")}>Refusé</Button>
            </>
          )}
          {inv.kind === "quote" && ["sent", "accepted"].includes(inv.status) && inv.status !== "converted" && (
            <Button size="sm" onClick={() => convert.mutate()} className="bg-gold text-navy-deep">
              <RefreshCcw className="mr-1.5 h-4 w-4" />Convertir en facture
            </Button>
          )}
          {inv.kind === "invoice" && !["paid", "cancelled"].includes(inv.status) && (
            <Button size="sm" onClick={() => setPayOpen(true)}><DollarSign className="mr-1.5 h-4 w-4" />Paiement</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => download.mutate()} disabled={download.isPending}>
            <Download className="mr-1.5 h-4 w-4" />PDF
          </Button>
          {!locked && inv.status !== "cancelled" && (
            <Button size="sm" variant="ghost" onClick={() => changeStatus.mutate("cancelled")}>Annuler</Button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 shadow-[var(--shadow-card)]">
            <CardContent className="p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold text-navy-deep">Prestations</h3>
                {!locked && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value=""
                      onValueChange={(v) => {
                        const svc = services[Number(v)];
                        if (!svc) return;
                        setItems([...items, { label: svc.label, quantity: 1, unit_price: svc.price }]);
                      }}
                    >
                      <SelectTrigger className="h-9 w-[280px] text-xs">
                        <SelectValue placeholder={usingFirmPricing ? "Grille du cabinet…" : "Ajouter une prestation…"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[320px]">
                        {services.map((s, i) => (
                          <SelectItem key={i} value={String(i)}>
                            <span className="mr-2">{s.label}</span>
                            <span className="font-mono text-xs text-muted-foreground">{s.price} $</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => setItems([...items, { label: "", quantity: 1, unit_price: 0 }])}>
                      <Plus className="mr-1.5 h-4 w-4" />Ligne libre
                    </Button>
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Désignation</TableHead>
                    <TableHead className="w-24">Qté</TableHead>
                    <TableHead className="w-32">Prix U.</TableHead>
                    <TableHead className="w-28 text-right">Total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input value={it.label} onChange={(e) => { const c = [...items]; c[i] = { ...it, label: e.target.value }; setItems(c); }} disabled={locked} placeholder="Consultation, rédaction…" />
                        <Textarea rows={1} className="mt-1 text-xs" value={it.description ?? ""} onChange={(e) => { const c = [...items]; c[i] = { ...it, description: e.target.value }; setItems(c); }} disabled={locked} placeholder="Détails (optionnel)" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={it.quantity} onChange={(e) => { const c = [...items]; c[i] = { ...it, quantity: Number(e.target.value) }; setItems(c); }} disabled={locked} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="0.01" value={it.unit_price} onChange={(e) => { const c = [...items]; c[i] = { ...it, unit_price: Number(e.target.value) }; setItems(c); }} disabled={locked} />
                      </TableCell>
                      <TableCell className="text-right font-mono">{(it.quantity * it.unit_price).toFixed(2)}</TableCell>
                      <TableCell>
                        {!locked && (
                          <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>TVA (%)</Label>
                  <Input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} disabled={locked} />
                </div>
                <div>
                  <Label>Date d'échéance</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={locked} />
                </div>
              </div>

              <div className="mt-4 grid gap-3">
                <div>
                  <Label>Notes</Label>
                  <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={locked} />
                </div>
                <div>
                  <Label>Conditions</Label>
                  <Textarea rows={2} value={terms} onChange={(e) => setTerms(e.target.value)} disabled={locked} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-6">
                <h3 className="font-display text-lg font-bold text-navy-deep">Liens</h3>
                <div className="mt-3 space-y-2 text-sm">
                  {inv.client_id ? (
                    <Link
                      to="/clients/$id"
                      params={{ id: inv.client_id }}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 hover:bg-muted"
                    >
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 text-navy" />
                        <span className="font-medium">
                          {inv.client_snapshot?.last_name?.toUpperCase() ?? ""} {inv.client_snapshot?.first_name ?? ""}
                        </span>
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Aucun client lié</p>
                  )}
                  {inv.matter_id ? (
                    <Link
                      to="/dossiers/$matterId"
                      params={{ matterId: inv.matter_id }}
                      className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 hover:bg-muted"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Folder className="h-4 w-4 text-navy" />
                        <span className="font-medium truncate">Ouvrir le dossier</span>
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                    </Link>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">Aucun dossier lié</p>
                  )}
                </div>
                {!locked && (
                  <div className="mt-4 border-t border-border pt-4">
                    <ClientMatterPicker value={picker} onChange={setPicker} />
                    <p className="mt-2 text-xs text-muted-foreground">
                      Les changements sont appliqués via « Enregistrer ».
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <SignaturePanel invoiceId={id} kind={inv.kind} />


            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-6">
                <h3 className="font-display text-lg font-bold text-navy-deep">Totaux</h3>
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Sous-total</dt><dd className="font-mono">{subtotal.toFixed(2)} {inv.currency}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">TVA</dt><dd className="font-mono">{taxAmount.toFixed(2)} {inv.currency}</dd></div>
                  <div className="flex justify-between border-t pt-2"><dt className="font-bold text-navy-deep">Total</dt><dd className="font-mono font-bold text-navy-deep">{total.toFixed(2)} {inv.currency}</dd></div>
                  {inv.kind === "invoice" && (
                    <div className="flex justify-between"><dt className="text-muted-foreground">Réglé</dt><dd className="font-mono">{Number(inv.paid_amount).toFixed(2)} {inv.currency}</dd></div>
                  )}
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-navy-deep">
                  <QrCode className="h-4 w-4" />
                  <h3 className="font-display text-sm font-bold">Vérification publique</h3>
                </div>
                <p className="mt-2 break-all text-xs text-muted-foreground">{verifyUrl}</p>
              </CardContent>
            </Card>

            {inv.kind === "invoice" && (inv.payments ?? []).length > 0 && (
              <Card className="shadow-[var(--shadow-card)]">
                <CardContent className="p-6">
                  <h3 className="font-display text-lg font-bold text-navy-deep">Paiements</h3>
                  <ul className="mt-3 space-y-2 text-sm">
                    {(inv.payments ?? []).map((p: any) => (
                      <li key={p.id} className="flex justify-between border-b border-border pb-2">
                        <span>{p.received_on} · {p.method}{p.reference ? ` (${p.reference})` : ""}</span>
                        <span className="font-mono font-semibold">{Number(p.amount).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enregistrer un paiement</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Montant *</Label><Input type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: Number(e.target.value) })} /></div>
            <div>
              <Label>Méthode</Label>
              <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Espèces</SelectItem>
                  <SelectItem value="transfer">Virement</SelectItem>
                  <SelectItem value="check">Chèque</SelectItem>
                  <SelectItem value="card">Carte</SelectItem>
                  <SelectItem value="other">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Référence</Label><Input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="N° transaction…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={pay.amount <= 0 || recPay.isPending} onClick={() => recPay.mutate()}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
