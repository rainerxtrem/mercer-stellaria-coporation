import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import {
  listTrainingsAdmin, upsertTraining, deleteTraining,
  listTrainingCategories, upsertTrainingCategory,
} from "@/lib/trainings-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/formations/")({
  head: () => ({ meta: [{ title: "Formations — Administration" }] }),
  component: Page,
});

function statusBadge(s: string) {
  if (s === "published") return <Badge className="bg-success/15 text-success hover:bg-success/20">Publiée</Badge>;
  if (s === "archived") return <Badge variant="secondary">Archivée</Badge>;
  return <Badge variant="outline">Brouillon</Badge>;
}

function Page() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [catDialog, setCatDialog] = useState(false);
  const [catName, setCatName] = useState("");
  const [form, setForm] = useState({ title: "", category_id: "none" as string });

  const listFn = useServerFn(listTrainingsAdmin);
  const catFn = useServerFn(listTrainingCategories);
  const saveFn = useServerFn(upsertTraining);
  const delFn = useServerFn(deleteTraining);
  const saveCatFn = useServerFn(upsertTrainingCategory);

  const trainings = useQuery({ queryKey: ["adm-trainings"], queryFn: () => listFn() });
  const cats = useQuery({ queryKey: ["adm-tr-cats"], queryFn: () => catFn() });

  const create = useMutation({
    mutationFn: () => saveFn({ data: {
      title: form.title,
      category_id: form.category_id === "none" ? null : form.category_id,
    }}),
    onSuccess: (r: any) => {
      toast.success("Formation créée");
      qc.invalidateQueries({ queryKey: ["adm-trainings"] });
      setCreating(false);
      if (r?.id) navigate({ to: "/admin/formations/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Formation supprimée"); qc.invalidateQueries({ queryKey: ["adm-trainings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCat = useMutation({
    mutationFn: () => saveCatFn({ data: { name: catName } }),
    onSuccess: () => { toast.success("Catégorie créée"); setCatName(""); setCatDialog(false); qc.invalidateQueries({ queryKey: ["adm-tr-cats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold text-navy-deep">Formations continues</h2>
          <p className="text-sm text-muted-foreground">Gérez le catalogue de formations, questionnaires et résultats.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCatDialog(true)}>Nouvelle catégorie</Button>
          <Button onClick={() => setCreating(true)} className="bg-navy text-white hover:bg-navy-deep"><Plus className="mr-2 h-4 w-4" />Nouvelle formation</Button>
        </div>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titre</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Points</TableHead>
                <TableHead>Seuil</TableHead>
                <TableHead>Durée</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="w-32 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trainings.isLoading ? <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
              : (trainings.data ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Aucune formation. Créez la première.</TableCell></TableRow>
              : (trainings.data as any[]).map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.title}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.training_categories?.name ?? "—"}</TableCell>
                  <TableCell>{t.points}</TableCell>
                  <TableCell>{t.pass_threshold}%</TableCell>
                  <TableCell>{t.duration_min} min</TableCell>
                  <TableCell>{statusBadge(t.status)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" asChild aria-label="Ouvrir">
                      <Link to="/admin/formations/$id" params={{ id: t.id }}><Pencil className="h-4 w-4" /></Link>
                    </Button>
                    {t.status === "published" && (
                      <Button size="icon" variant="ghost" asChild aria-label="Voir côté public" title="Voir côté public">
                        <Link to="/formations/$slug" params={{ slug: t.slug }}><ExternalLink className="h-4 w-4" /></Link>
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => confirm(`Supprimer "${t.title}" ?`) && remove.mutate(t.id)} aria-label="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouvelle formation</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Titre *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. Déontologie – 2026" /></div>
            <div><Label>Catégorie</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Aucune —</SelectItem>
                  {(cats.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Annuler</Button>
            <Button disabled={!form.title.trim() || create.isPending} onClick={() => create.mutate()} className="bg-navy text-white">Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Nouvelle catégorie</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nom *</Label><Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ex. Déontologie" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialog(false)}>Annuler</Button>
            <Button disabled={!catName.trim() || saveCat.isPending} onClick={() => saveCat.mutate()} className="bg-navy text-white">Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
