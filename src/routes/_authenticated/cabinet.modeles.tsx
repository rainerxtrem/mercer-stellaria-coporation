import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Archive, Copy, Download, FileText, FolderPlus, History, Loader2, Pencil,
  Plus, Search, Sparkles, Trash2, Upload,
} from "lucide-react";
import { TemplateFieldsDialog } from "@/components/app/TemplateFieldsDialog";
import {
  getTemplateAccess, listTemplateCategories, upsertTemplateCategory, deleteTemplateCategory,
  listTemplates, getTemplate, createTemplateUploadUrl, createTemplate, updateTemplate,
  publishTemplateVersion, duplicateTemplate, deleteTemplate, getTemplateFileUrl,
} from "@/lib/doc-templates.functions";

export const Route = createFileRoute("/_authenticated/cabinet/modeles")({
  head: () => ({
    meta: [
      { title: "Modèles documentaires — Cabinet | Mercer & Stellaria Corporation" },
      { name: "description", content: "Bibliothèque de modèles juridiques du cabinet : import DOCX/PDF, catégories, versions et activation." },
      { property: "og:title", content: "Modèles documentaires du cabinet" },
      { property: "og:description", content: "Gérez la bibliothèque de modèles juridiques de votre cabinet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Cat = { id: string; name: string; parent_id: string | null; position: number };
type Tpl = {
  id: string; name: string; description: string | null; kind: "pdf" | "docx";
  active: boolean; archived: boolean; current_version: number; category_id: string | null;
  updated_at: string; doc_template_categories?: { name: string } | null;
};

const ACCEPT = ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function Page() {
  const qc = useQueryClient();
  const accessFn = useServerFn(getTemplateAccess);
  const listCatsFn = useServerFn(listTemplateCategories);
  const upsertCatFn = useServerFn(upsertTemplateCategory);
  const delCatFn = useServerFn(deleteTemplateCategory);
  const listFn = useServerFn(listTemplates);
  const getFn = useServerFn(getTemplate);
  const upUrlFn = useServerFn(createTemplateUploadUrl);
  const createFn = useServerFn(createTemplate);
  const updateFn = useServerFn(updateTemplate);
  const publishFn = useServerFn(publishTemplateVersion);
  const dupFn = useServerFn(duplicateTemplate);
  const delFn = useServerFn(deleteTemplate);
  const dlFn = useServerFn(getTemplateFileUrl);

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const access = useQuery({ queryKey: ["tpl-access"], queryFn: () => accessFn() });
  const cats = useQuery({ queryKey: ["tpl-cats"], queryFn: () => listCatsFn({ data: {} }) });
  const tpls = useQuery({
    queryKey: ["tpl-list", search, cat, showArchived],
    queryFn: () => listFn({ data: {
      search: search || undefined,
      category_id: cat !== "all" ? cat : undefined,
      includeArchived: showArchived,
    } }),
  });

  const canManage = !!access.data?.canManage;
  const catList = (cats.data ?? []) as Cat[];
  const rows = (tpls.data ?? []) as Tpl[];

  // ---- import / édition ----
  const [importOpen, setImportOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category_id: "none" });
  const fileRef = useRef<HTMLInputElement>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Tpl | null>(null);

  const [catOpen, setCatOpen] = useState(false);
  const [catForm, setCatForm] = useState({ id: undefined as string | undefined, name: "", parent_id: "none" });

  const [versionsFor, setVersionsFor] = useState<Tpl | null>(null);
  const [fieldsFor, setFieldsFor] = useState<Tpl | null>(null);
  const versions = useQuery({
    queryKey: ["tpl-versions", versionsFor?.id],
    queryFn: () => getFn({ data: { id: versionsFor!.id } }),
    enabled: !!versionsFor,
  });
  const newVersionRef = useRef<HTMLInputElement>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["tpl-list"] });
    qc.invalidateQueries({ queryKey: ["tpl-versions"] });
  }

  async function uploadFile(file: File) {
    const { path, token } = await upUrlFn({ data: { filename: file.name } });
    const { error } = await supabase.storage.from("firm-templates").uploadToSignedUrl(path, token, file);
    if (error) throw error;
    return {
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      size_bytes: file.size,
    };
  }

  async function submitImport() {
    const file = fileRef.current?.files?.[0];
    if (!form.name.trim()) return toast.error("Indiquez un nom de modèle.");
    if (!file) return toast.error("Sélectionnez un fichier DOCX ou PDF.");
    setBusy(true);
    try {
      const uploaded = await uploadFile(file);
      await createFn({ data: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        category_id: form.category_id !== "none" ? form.category_id : null,
        file: uploaded,
      } });
      toast.success("Modèle importé");
      setImportOpen(false);
      setForm({ name: "", description: "", category_id: "none" });
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitNewVersion() {
    const file = newVersionRef.current?.files?.[0];
    if (!file || !versionsFor) return toast.error("Sélectionnez un fichier.");
    setBusy(true);
    try {
      const uploaded = await uploadFile(file);
      const r = await publishFn({ data: { template_id: versionsFor.id, file: uploaded } });
      toast.success(`Version ${r.version} publiée`);
      if (newVersionRef.current) newVersionRef.current.value = "";
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const saveEdit = useMutation({
    mutationFn: () => updateFn({ data: {
      id: editing!.id,
      name: editing!.name.trim(),
      description: editing!.description?.trim() || null,
      category_id: editing!.category_id,
    } }),
    onSuccess: () => { toast.success("Modèle mis à jour"); setEditOpen(false); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: (v: { id: string; active?: boolean; archived?: boolean }) => updateFn({ data: v }),
    onSuccess: () => refresh(),
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => { toast.success("Modèle dupliqué (inactif)"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Modèle supprimé"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveCat = useMutation({
    mutationFn: () => upsertCatFn({ data: {
      id: catForm.id,
      name: catForm.name.trim(),
      parent_id: catForm.parent_id !== "none" ? catForm.parent_id : null,
    } }),
    onSuccess: () => {
      toast.success("Catégorie enregistrée");
      setCatOpen(false);
      setCatForm({ id: undefined, name: "", parent_id: "none" });
      qc.invalidateQueries({ queryKey: ["tpl-cats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCat = useMutation({
    mutationFn: (id: string) => delCatFn({ data: { id } }),
    onSuccess: () => { toast.success("Catégorie supprimée"); qc.invalidateQueries({ queryKey: ["tpl-cats"] }); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(id: string) {
    try {
      const r = await dlFn({ data: { template_id: id } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (access.isLoading) {
    return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }

  if (!access.data?.firmId) {
    return (
      <>
        <PageHeader eyebrow="Cabinet" title="Modèles documentaires" description="Bibliothèque de modèles juridiques du cabinet." />
        <section className="container-page py-16 text-center text-muted-foreground">
          Aucun cabinet n'est rattaché à votre compte.
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={access.data.firmName ?? "Cabinet"}
        title="Modèles documentaires"
        description="Préparez une seule fois vos modèles juridiques : tous les avocats du cabinet pourront ensuite les utiliser."
      />

      <section className="container-page space-y-6 py-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un modèle…" className="h-10 pl-9" />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Catégorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {catList.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.parent_id ? "↳ " : ""}{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} /> Archivés
          </label>
          {canManage && (
            <>
              <Button variant="outline" onClick={() => { setCatForm({ id: undefined, name: "", parent_id: "none" }); setCatOpen(true); }}>
                <FolderPlus className="mr-2 h-4 w-4" /> Catégorie
              </Button>
              <Button className="bg-navy text-white" onClick={() => setImportOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Importer un modèle
              </Button>
            </>
          )}
        </div>

        {canManage && catList.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {catList.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs">
                {c.parent_id ? "↳ " : ""}{c.name}
                <button className="text-muted-foreground hover:text-gold" onClick={() => { setCatForm({ id: c.id, name: c.name, parent_id: c.parent_id ?? "none" }); setCatOpen(true); }}>
                  <Pencil className="h-3 w-3" />
                </button>
                <button className="text-muted-foreground hover:text-destructive" onClick={() => removeCat.mutate(c.id)}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {tpls.isLoading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
            Aucun modèle pour le moment.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((t) => (
              <Card key={t.id} className={t.archived ? "opacity-60" : undefined}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="uppercase">{t.kind}</Badge>
                      {t.doc_template_categories?.name && <Badge variant="secondary">{t.doc_template_categories.name}</Badge>}
                      <Badge variant="outline">v{t.current_version}</Badge>
                      {!t.active && <Badge variant="outline" className="text-muted-foreground">Inactif</Badge>}
                      {t.archived && <Badge variant="outline" className="text-muted-foreground">Archivé</Badge>}
                    </div>
                    <h3 className="mt-2 flex items-center gap-2 font-display text-lg font-bold">
                      <FileText className="h-4 w-4 text-gold" /> {t.name}
                    </h3>
                    {t.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{t.description}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => download(t.id)}>
                      <Download className="mr-2 h-4 w-4" /> Fichier
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setFieldsFor(t)}>
                      <Sparkles className="mr-2 h-4 w-4" /> Champs
                    </Button>
                    {canManage && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setVersionsFor(t)}>
                          <History className="mr-2 h-4 w-4" /> Versions
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(t); setEditOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => duplicate.mutate(t.id)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                        <label className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
                          <Switch checked={t.active} onCheckedChange={(v) => patch.mutate({ id: t.id, active: v })} /> Actif
                        </label>
                        <Button size="sm" variant="outline" onClick={() => patch.mutate({ id: t.id, archived: !t.archived })}>
                          <Archive className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-destructive"
                          onClick={() => { if (confirm(`Supprimer définitivement « ${t.name} » ?`)) remove.mutate(t.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importer un modèle</DialogTitle>
            <DialogDescription>Fichier DOCX ou PDF. Le paramétrage des champs se fera à l'étape suivante.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="tpl-name">Nom du modèle</Label>
              <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Convention d'honoraires" />
            </div>
            <div>
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea id="tpl-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div>
              <Label>Catégorie</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Sans catégorie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sans catégorie</SelectItem>
                  {catList.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tpl-file">Fichier</Label>
              <Input id="tpl-file" ref={fileRef} type="file" accept={ACCEPT} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={busy} onClick={submitImport}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Importer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Édition */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le modèle</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="ed-name">Nom</Label>
                <Input id="ed-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ed-desc">Description</Label>
                <Textarea id="ed-desc" rows={3} value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
              </div>
              <div>
                <Label>Catégorie</Label>
                <Select value={editing.category_id ?? "none"} onValueChange={(v) => setEditing({ ...editing, category_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sans catégorie</SelectItem>
                    {catList.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={saveEdit.isPending} onClick={() => saveEdit.mutate()}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Catégorie */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{catForm.id ? "Modifier la catégorie" : "Nouvelle catégorie"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cat-name">Nom</Label>
              <Input id="cat-name" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} placeholder="Actes de procédure" />
            </div>
            <div>
              <Label>Dossier parent</Label>
              <Select value={catForm.parent_id} onValueChange={(v) => setCatForm({ ...catForm, parent_id: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aucun (racine)</SelectItem>
                  {catList.filter((c) => c.id !== catForm.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatOpen(false)}>Annuler</Button>
            <Button className="bg-navy text-white" disabled={saveCat.isPending} onClick={() => saveCat.mutate()}>Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Versions */}
      <Dialog open={!!versionsFor} onOpenChange={(o) => !o && setVersionsFor(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Versions — {versionsFor?.name}</DialogTitle>
            <DialogDescription>Les documents déjà générés restent liés à la version utilisée.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(versions.data?.versions ?? []).map((v: any) => (
              <div key={v.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                <div className="min-w-0">
                  <div className="font-medium">Version {v.version}</div>
                  <div className="truncate text-xs text-muted-foreground">{v.file_name} · {new Date(v.created_at).toLocaleDateString("fr-FR")}</div>
                </div>
                <Button size="sm" variant="outline" onClick={async () => {
                  const r = await dlFn({ data: { version_id: v.id } });
                  window.open(r.url, "_blank", "noopener");
                }}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-border p-3">
              <Label htmlFor="new-ver">Publier une nouvelle version</Label>
              <div className="mt-2 flex gap-2">
                <Input id="new-ver" ref={newVersionRef} type="file" accept={ACCEPT} />
                <Button disabled={busy} onClick={submitNewVersion} className="bg-navy text-white shrink-0">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Champs & variables */}
      <TemplateFieldsDialog
        templateId={fieldsFor?.id ?? null}
        templateName={fieldsFor?.name}
        canManage={canManage}
        onOpenChange={(o) => { if (!o) setFieldsFor(null); refresh(); }}
      />
    </>

  );
}
