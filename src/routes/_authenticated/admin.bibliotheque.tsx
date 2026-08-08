import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FolderTree, FilePlus2, Pencil, Trash2, Search, Upload, Download,
  Loader2, Eye, EyeOff, Paperclip, Plus, X,
} from "lucide-react";
import {
  listLibraryCategories, upsertLibraryCategory, deleteLibraryCategory,
  listLibraryArticles, getLibraryArticle, upsertLibraryArticle,
  toggleLibraryPublication, deleteLibraryArticle,
  createLibraryUploadUrl, finalizeLibraryAttachment, removeLibraryAttachment,
  getLibraryAttachmentUrl,
} from "@/lib/library.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/bibliotheque")({
  head: () => ({ meta: [{ title: "Bibliothèque juridique — Administration" }] }),
  component: Page,
});

type Cat = { id: string; name: string; slug: string; parent_id: string | null; position: number };
type Art = {
  id: string; title: string; slug: string; excerpt: string | null;
  tags: string[]; theme: string | null; status: string; category_id: string | null;
  attachment_name: string | null; attachment_mime: string | null; updated_at: string;
  library_categories?: { name: string; slug: string } | null;
};

function statusBadge(s: string) {
  if (s === "published") return <Badge className="bg-success/15 text-success hover:bg-success/20">Publié</Badge>;
  if (s === "archived") return <Badge variant="secondary">Archivé</Badge>;
  return <Badge variant="outline">Brouillon</Badge>;
}

function Page() {
  const qc = useQueryClient();
  const [selCat, setSelCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "published" | "archived">("all");
  const [catEdit, setCatEdit] = useState<Partial<Cat> | null>(null);
  const [artEditId, setArtEditId] = useState<string | "new" | null>(null);

  const listCatFn = useServerFn(listLibraryCategories);
  const upsertCatFn = useServerFn(upsertLibraryCategory);
  const delCatFn = useServerFn(deleteLibraryCategory);
  const listArtFn = useServerFn(listLibraryArticles);
  const delArtFn = useServerFn(deleteLibraryArticle);
  const toggleFn = useServerFn(toggleLibraryPublication);

  const catQ = useQuery({ queryKey: ["lib-cats"], queryFn: () => listCatFn() });
  const artQ = useQuery({
    queryKey: ["lib-arts", selCat, status, search],
    queryFn: () => listArtFn({ data: {
      search: search || undefined,
      category_id: selCat !== "all" ? selCat : undefined,
      status: status,
    }}),
  });

  const cats = (catQ.data ?? []) as Cat[];
  const roots = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const childrenOf = (id: string) => cats.filter((c) => c.parent_id === id);

  const saveCat = useMutation({
    mutationFn: (v: Partial<Cat>) => upsertCatFn({ data: {
      id: v.id, name: v.name ?? "", slug: v.slug || undefined,
      parent_id: v.parent_id ?? null, position: v.position ?? 0,
    }}),
    onSuccess: () => { toast.success("Catégorie enregistrée"); setCatEdit(null); qc.invalidateQueries({ queryKey: ["lib-cats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeCat = useMutation({
    mutationFn: (id: string) => delCatFn({ data: { id } }),
    onSuccess: () => { toast.success("Catégorie supprimée"); qc.invalidateQueries({ queryKey: ["lib-cats"] }); qc.invalidateQueries({ queryKey: ["lib-arts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeArt = useMutation({
    mutationFn: (id: string) => delArtFn({ data: { id } }),
    onSuccess: () => { toast.success("Article supprimé"); qc.invalidateQueries({ queryKey: ["lib-arts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const togglePub = useMutation({
    mutationFn: (v: { id: string; status: "draft" | "published" | "archived" }) => toggleFn({ data: v }),
    onSuccess: () => { toast.success("Statut mis à jour"); qc.invalidateQueries({ queryKey: ["lib-arts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Sidebar catégories */}
      <Card className="h-fit shadow-[var(--shadow-card)]">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 font-display text-sm font-bold text-navy-deep">
              <FolderTree className="h-4 w-4 text-gold" /> Catégories
            </div>
            <Button size="sm" variant="ghost" onClick={() => setCatEdit({ name: "", parent_id: null })}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <button
            className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${selCat === "all" ? "bg-navy text-white" : "hover:bg-muted"}`}
            onClick={() => setSelCat("all")}
          >Toutes les catégories</button>
          <div className="mt-2 space-y-1">
            {catQ.isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            : roots.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">Aucune catégorie. Cliquez sur + pour en créer.</p>
            : roots.map((c) => (
              <div key={c.id}>
                <div className="group flex items-center gap-1">
                  <button
                    className={`flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm ${selCat === c.id ? "bg-navy text-white" : "hover:bg-muted"}`}
                    onClick={() => setSelCat(c.id)}
                  >{c.name}</button>
                  <button className="opacity-0 group-hover:opacity-100" onClick={() => setCatEdit(c)} aria-label="Éditer">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button className="opacity-0 group-hover:opacity-100" onClick={() => confirm(`Supprimer "${c.name}" ?`) && removeCat.mutate(c.id)} aria-label="Supprimer">
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </div>
                {childrenOf(c.id).map((sub) => (
                  <div key={sub.id} className="group ml-4 flex items-center gap-1">
                    <button
                      className={`flex-1 truncate rounded-md px-2 py-1 text-left text-xs ${selCat === sub.id ? "bg-navy text-white" : "hover:bg-muted"}`}
                      onClick={() => setSelCat(sub.id)}
                    >↳ {sub.name}</button>
                    <button className="opacity-0 group-hover:opacity-100" onClick={() => setCatEdit(sub)}>
                      <Pencil className="h-3 w-3 text-muted-foreground" />
                    </button>
                    <button className="opacity-0 group-hover:opacity-100" onClick={() => confirm(`Supprimer "${sub.name}" ?`) && removeCat.mutate(sub.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Panneau articles */}
      <div className="space-y-4">
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-[200px] flex-1">
              <Label className="text-xs">Recherche</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Titre, résumé, thème…" className="pl-8" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Statut</Label>
              <Select value={status} onValueChange={(v: any) => setStatus(v)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="draft">Brouillons</SelectItem>
                  <SelectItem value="published">Publiés</SelectItem>
                  <SelectItem value="archived">Archivés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => setArtEditId("new")} className="bg-navy text-white hover:bg-navy-deep">
              <FilePlus2 className="mr-2 h-4 w-4" /> Nouvel article
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titre</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>PJ</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {artQ.isLoading ? <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                : (artQ.data ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Aucun article.</TableCell></TableRow>
                : ((artQ.data ?? []) as Art[]).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-xs truncate font-medium">{a.title}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.library_categories?.name ?? "—"}</TableCell>
                    <TableCell><div className="flex flex-wrap gap-1">{(a.tags ?? []).slice(0, 3).map((t) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div></TableCell>
                    <TableCell>{a.attachment_name ? <Paperclip className="h-4 w-4 text-gold" /> : null}</TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => togglePub.mutate({ id: a.id, status: a.status === "published" ? "draft" : "published" })} aria-label="Publier/Dépublier" title={a.status === "published" ? "Dépublier" : "Publier"}>
                        {a.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setArtEditId(a.id)} aria-label="Éditer"><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => confirm(`Supprimer "${a.title}" ?`) && removeArt.mutate(a.id)} aria-label="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Dialog catégorie */}
      <Dialog open={!!catEdit} onOpenChange={(o) => !o && setCatEdit(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{catEdit?.id ? "Modifier la catégorie" : "Nouvelle catégorie"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Nom *</Label><Input value={catEdit?.name ?? ""} onChange={(e) => setCatEdit({ ...catEdit!, name: e.target.value })} /></div>
            <div><Label>Slug (optionnel)</Label><Input value={catEdit?.slug ?? ""} onChange={(e) => setCatEdit({ ...catEdit!, slug: e.target.value })} placeholder="Auto si vide" /></div>
            <div>
              <Label>Catégorie parente</Label>
              <Select value={catEdit?.parent_id ?? "root"} onValueChange={(v) => setCatEdit({ ...catEdit!, parent_id: v === "root" ? null : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">— Catégorie racine —</SelectItem>
                  {cats.filter((c) => c.id !== catEdit?.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatEdit(null)}>Annuler</Button>
            <Button disabled={!catEdit?.name?.trim() || saveCat.isPending} onClick={() => saveCat.mutate(catEdit!)} className="bg-navy text-white">Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog article */}
      <ArticleDialog
        articleId={artEditId}
        cats={cats}
        onClose={() => setArtEditId(null)}
        onSaved={() => { qc.invalidateQueries({ queryKey: ["lib-arts"] }); }}
      />
    </div>
  );
}

function ArticleDialog({ articleId, cats, onClose, onSaved }: {
  articleId: string | "new" | null;
  cats: { id: string; name: string; parent_id: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getLibraryArticle);
  const saveFn = useServerFn(upsertLibraryArticle);
  const upUrlFn = useServerFn(createLibraryUploadUrl);
  const finalFn = useServerFn(finalizeLibraryAttachment);
  const remAttFn = useServerFn(removeLibraryAttachment);
  const dlUrlFn = useServerFn(getLibraryAttachmentUrl);

  const isNew = articleId === "new";
  const load = useQuery({
    queryKey: ["lib-art", articleId],
    queryFn: () => (articleId && !isNew) ? getFn({ data: { id: articleId } }) : Promise.resolve(null),
    enabled: !!articleId,
  });

  const [form, setForm] = useState<any>(null);
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useMemo(() => {
    if (!articleId) return;
    if (isNew) setForm({ title: "", slug: "", excerpt: "", body: "", category_id: null, tags: [], theme: "", status: "draft", external_link: "" });
    else if (load.data) setForm({
      ...(load.data as any),
      tags: (load.data as any).tags ?? [],
      external_link: (load.data as any).external_link ?? "",
    });
  }, [articleId, isNew, load.data]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await saveFn({ data: {
        id: form.id, title: form.title, slug: form.slug || undefined,
        excerpt: form.excerpt || null, body: form.body || null,
        category_id: form.category_id || null,
        tags: form.tags, theme: form.theme || null,
        status: form.status, external_link: form.external_link || null,
      }});
      return r;
    },
    onSuccess: (r: any) => {
      toast.success("Article enregistré");
      onSaved();
      if (!form.id && r?.id) setForm({ ...form, id: r.id });
      else onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onUpload(file: File) {
    if (!form?.id) { toast.error("Enregistrez d'abord l'article."); return; }
    setUploading(true);
    try {
      const { path, token } = await upUrlFn({ data: { article_id: form.id, filename: file.name } });
      const { error: upErr } = await supabase.storage.from("bar-library").uploadToSignedUrl(path, token, file);
      if (upErr) throw upErr;
      await finalFn({ data: {
        id: form.id, attachment_path: path,
        attachment_name: file.name, attachment_mime: file.type || "application/octet-stream",
        attachment_size: file.size,
      }});
      toast.success("Pièce jointe téléversée");
      qc.invalidateQueries({ queryKey: ["lib-art", form.id] });
      setForm({ ...form, attachment_path: path, attachment_name: file.name, attachment_mime: file.type, attachment_size: file.size });
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur upload");
    } finally { setUploading(false); }
  }

  async function onDownload() {
    if (!form?.id) return;
    const r = await dlUrlFn({ data: { id: form.id } });
    window.open(r.url, "_blank", "noopener");
  }

  async function onRemoveAttachment() {
    if (!form?.id) return;
    await remAttFn({ data: { id: form.id } });
    toast.success("Pièce jointe supprimée");
    setForm({ ...form, attachment_path: null, attachment_name: null, attachment_mime: null, attachment_size: null });
  }

  const addTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
    setTagInput("");
  };

  return (
    <Dialog open={!!articleId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{isNew ? "Nouvel article" : "Modifier l'article"}</DialogTitle></DialogHeader>
        {!form ? <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
          <div className="grid max-h-[70vh] gap-3 overflow-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Titre *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>Slug (optionnel)</Label><Input value={form.slug ?? ""} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="Auto si vide" /></div>
              <div><Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="published">Publié</SelectItem>
                    <SelectItem value="archived">Archivé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Catégorie</Label>
                <Select value={form.category_id ?? "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Aucune —</SelectItem>
                    {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.parent_id ? "↳ " : ""}{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Thème</Label><Input value={form.theme ?? ""} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder="ex. Droit pénal" /></div>
            </div>
            <div><Label>Résumé</Label><Textarea rows={2} value={form.excerpt ?? ""} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} maxLength={500} /></div>
            <div><Label>Contenu (Markdown accepté)</Label><Textarea rows={10} value={form.body ?? ""} onChange={(e) => setForm({ ...form, body: e.target.value })} className="font-mono text-sm" /></div>
            <div><Label>Lien externe (optionnel)</Label><Input value={form.external_link ?? ""} onChange={(e) => setForm({ ...form, external_link: e.target.value })} placeholder="https://…" /></div>
            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1">
                {form.tags.map((t: string) => (
                  <Badge key={t} variant="secondary" className="gap-1">{t}<button onClick={() => setForm({ ...form, tags: form.tags.filter((x: string) => x !== t) })}><X className="h-3 w-3" /></button></Badge>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Ajouter un tag et Entrée" />
                <Button type="button" variant="outline" onClick={addTag}>Ajouter</Button>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Paperclip className="h-4 w-4 text-gold" />Pièce jointe (PDF, DOCX, …)</div>
              {form.attachment_name ? (
                <div className="flex items-center justify-between gap-2 rounded-md bg-muted p-2 text-sm">
                  <div className="min-w-0 truncate"><span className="font-medium">{form.attachment_name}</span> <span className="text-xs text-muted-foreground">({(form.attachment_size ?? 0) > 1024 * 1024 ? `${((form.attachment_size ?? 0) / 1024 / 1024).toFixed(1)} Mo` : `${Math.round((form.attachment_size ?? 0) / 1024)} Ko`})</span></div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={onDownload}><Download className="mr-1 h-4 w-4" />Télécharger</Button>
                    <Button size="sm" variant="ghost" onClick={onRemoveAttachment} aria-label="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">Aucune pièce jointe.</div>
              )}
              <div className="mt-2">
                <input ref={fileRef} type="file" hidden accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.jpg,.jpeg,.png,.gif,.zip" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onUpload(f); e.target.value = ""; }} />
                <Button size="sm" variant="outline" disabled={!form.id || uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {form.attachment_name ? "Remplacer" : "Téléverser"}
                </Button>
                {!form.id && <span className="ml-2 text-xs text-muted-foreground">Enregistrez d'abord l'article.</span>}
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fermer</Button>
          <Button disabled={!form?.title?.trim() || save.isPending} onClick={() => save.mutate()} className="bg-navy text-white">
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
