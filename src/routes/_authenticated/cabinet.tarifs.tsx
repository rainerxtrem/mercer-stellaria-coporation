import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listFirmPricing, upsertFirmPricingItem, deleteFirmPricingItem } from "@/lib/firm-pricing.functions";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cabinet/tarifs")({
  head: () => ({ meta: [{ title: "Grille tarifaire — Cabinet" }] }),
  component: Page,
});

type Row = {
  id: string; firm_id: string; service: string; description: string | null;
  price: number; active: boolean; updated_at: string;
};

const empty = { id: undefined as string | undefined, service: "", description: "", price: 0, active: true };

function Page() {
  const listFn = useServerFn(listFirmPricing);
  const upsertFn = useServerFn(upsertFirmPricingItem);
  const deleteFn = useServerFn(deleteFirmPricingItem);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["firm-pricing"], queryFn: () => listFn({ data: {} }) });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const save = useMutation({
    mutationFn: () => upsertFn({
      data: {
        id: form.id,
        service: form.service.trim(),
        description: form.description?.trim() || null,
        price: Number(form.price),
        active: form.active,
      },
    }),
    onSuccess: () => {
      toast.success("Grille mise à jour");
      setOpen(false);
      setForm(empty);
      qc.invalidateQueries({ queryKey: ["firm-pricing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: (row: Row) => upsertFn({
      data: {
        id: row.id,
        service: row.service,
        description: row.description,
        price: Number(row.price),
        active: !row.active,
      },
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["firm-pricing"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Prestation supprimée"); qc.invalidateQueries({ queryKey: ["firm-pricing"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function edit(row: Row) {
    setForm({
      id: row.id, service: row.service, description: row.description ?? "",
      price: Number(row.price), active: row.active,
    });
    setOpen(true);
  }

  const rows = (q.data ?? []) as Row[];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Direction de cabinet"
        title="Grille tarifaire"
        description="Chaque cabinet définit sa propre grille. Les avocats et assistants du cabinet utilisent uniquement ces tarifs pour leurs devis et factures."
      />

      <div className="flex justify-end">
        <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-navy text-white hover:bg-navy-deep">
          <Plus className="mr-2 h-4 w-4" />Ajouter une prestation
        </Button>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prestation</TableHead>
                <TableHead className="w-40">Description</TableHead>
                <TableHead className="w-32 text-right">Prix</TableHead>
                <TableHead className="w-24">Actif</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                  <DollarSign className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Aucune prestation. Ajoutez votre première ligne.
                </TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id} className={r.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{r.service}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.description ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{Number(r.price).toFixed(2)} $</TableCell>
                  <TableCell>
                    <Switch checked={r.active} onCheckedChange={() => toggleActive.mutate(r)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => {
                      if (confirm(`Supprimer « ${r.service} » ?`)) remove.mutate(r.id);
                    }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifier la prestation" : "Ajouter une prestation"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Prestation *</Label><Input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Consultation juridique simple" /></div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Prix (USD) *</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /><Label className="!m-0">Prestation active</Label></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              className="bg-navy text-white"
              disabled={!form.service.trim() || form.price < 0 || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
