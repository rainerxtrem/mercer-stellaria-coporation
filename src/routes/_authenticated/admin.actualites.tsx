import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { upsertNews, deleteNews } from "@/lib/registry.functions";

type News = { id: string; title: string; slug: string; excerpt: string | null; body: string | null; tag: string | null; cover_url: string | null; status: "draft" | "published" | "archived"; published_at: string | null };

export const Route = createFileRoute("/_authenticated/admin/actualites")({
  head: () => ({ meta: [{ title: "Actualités — Administration" }] }),
  component: Page,
});

const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function Page() {
  const [items, setItems] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const upsert = useServerFn(upsertNews);
  const del = useServerFn(deleteNews);

  async function refresh() {
    setLoading(true);
    const { data } = await supabase.from("news").select("*").order("created_at", { ascending: false });
    setItems((data ?? []) as News[]);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  const EMPTY = { title: "", slug: "", excerpt: "", body: "", tag: "Communiqué", cover_url: "", status: "draft" as const, published_at: null };

  async function save() {
    setSaving(true);
    try {
      const payload = { ...editing };
      if (!payload.slug) payload.slug = slugify(payload.title);
      if (payload.status === "published" && !payload.published_at) payload.published_at = new Date().toISOString();
      for (const k of ["excerpt","body","tag","cover_url"]) if (payload[k] === "") payload[k] = null;
      await upsert({ data: payload });
      toast.success("Actualité enregistrée.");
      setEditing(null);
      void refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSaving(false); }
  }

  async function handleDelete(n: News) {
    if (!confirm(`Supprimer "${n.title}" ?`)) return;
    try { await del({ data: { id: n.id } }); toast.success("Supprimée."); void refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-navy-deep">Actualités</h2>
          <p className="text-sm text-muted-foreground">Rédiger, publier, archiver les communications officielles.</p>
        </div>
        <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ ...EMPTY })} className="bg-navy text-white hover:bg-navy-deep"><Plus className="mr-2 h-4 w-4" />Nouvelle actualité</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            {editing && <>
              <DialogHeader><DialogTitle>{editing.id ? "Modifier l'actualité" : "Nouvelle actualité"}</DialogTitle></DialogHeader>
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-[1fr_180px]">
                  <div className="space-y-1"><Label>Titre *</Label><Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value, slug: editing.slug || slugify(e.target.value) })} /></div>
                  <div className="space-y-1"><Label>Rubrique</Label><Input value={editing.tag ?? ""} onChange={(e) => setEditing({ ...editing, tag: e.target.value })} /></div>
                </div>
                <div className="space-y-1"><Label>Slug (URL) *</Label><Input value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })} /></div>
                <div className="space-y-1"><Label>Image de couverture (URL)</Label><Input value={editing.cover_url ?? ""} onChange={(e) => setEditing({ ...editing, cover_url: e.target.value })} /></div>
                <div className="space-y-1"><Label>Résumé</Label><Textarea rows={2} value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} /></div>
                <div className="space-y-1"><Label>Contenu (Markdown)</Label><Textarea rows={8} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} /></div>
                <div className="space-y-1"><Label>Statut</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Brouillon</SelectItem>
                      <SelectItem value="published">Publiée</SelectItem>
                      <SelectItem value="archived">Archivée</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
                <Button onClick={save} disabled={saving} className="bg-navy text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
              </DialogFooter>
            </>}
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow><TableHead>Titre</TableHead><TableHead className="hidden md:table-cell">Rubrique</TableHead><TableHead>Statut</TableHead><TableHead className="hidden md:table-cell">Publiée le</TableHead><TableHead className="text-right">Actions</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            : items.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Aucune actualité.</TableCell></TableRow>
            : items.map((n) => (
              <TableRow key={n.id}>
                <TableCell><div className="font-medium text-navy-deep">{n.title}</div><div className="text-xs text-muted-foreground">/{n.slug}</div></TableCell>
                <TableCell className="hidden md:table-cell text-sm">{n.tag ?? "—"}</TableCell>
                <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${n.status === "published" ? "bg-success/15 text-success" : n.status === "draft" ? "bg-warning/15 text-warning" : "bg-secondary text-secondary-foreground"}`}>{n.status === "published" ? "Publiée" : n.status === "draft" ? "Brouillon" : "Archivée"}</span></TableCell>
                <TableCell className="hidden md:table-cell text-sm">{n.published_at ? new Date(n.published_at).toLocaleDateString("fr-FR") : "—"}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...n })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(n)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
