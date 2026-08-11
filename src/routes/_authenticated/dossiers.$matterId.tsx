import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getMatter,
  updateMatter,
  listMatterTree,
  createFolder,
  renameFolder,
  deleteFolder,
  createSignedUploadUrl,
  finalizeDocument,
  renameDocument,
  deleteDocument,
  getDocumentDownloadUrl,
  listMatterActivity,
} from "@/lib/matters.functions";
import {
  listMatterAssistants, addMatterAssistant, removeMatterAssistant,
  listTasks, createTask, updateTask, deleteTask,
} from "@/lib/assistant.functions";
import { createMatterDocumentSignatureLink } from "@/lib/signature.functions";
import { listInvoices } from "@/lib/invoices.functions";
import { toast } from "sonner";
import {
  ChevronRight, ChevronDown, Folder, FolderPlus, Upload, Trash2, Pencil,
  File as FileIcon, Download, ArrowLeft, Activity, FileText, FileImage, FileArchive,
  Users, CheckSquare, Plus, UserPlus, Receipt, FileSignature, ExternalLink,
} from "lucide-react";
import { useSession } from "@/lib/auth";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { matterStatusMeta, MATTER_STATUS_OPTIONS } from "@/lib/matter-status";

export const Route = createFileRoute("/_authenticated/dossiers/$matterId")({
  head: () => ({ meta: [{ title: "Dossier — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

type Folder = { id: string; matter_id: string; parent_id: string | null; name: string };
type Doc = { id: string; matter_id: string; folder_id: string | null; filename: string; storage_path: string; mime_type: string; size_bytes: number; created_at: string };

function formatSize(b: number) {
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}
function mimeIcon(m: string) {
  if (m.startsWith("image/")) return FileImage;
  if (m.includes("pdf")) return FileText;
  if (m.includes("zip")) return FileArchive;
  return FileIcon;
}

function Page() {
  const { matterId } = Route.useParams();
  const qc = useQueryClient();
  const getMatterFn = useServerFn(getMatter);
  const updateMatterFn = useServerFn(updateMatter);
  const treeFn = useServerFn(listMatterTree);
  const createFolderFn = useServerFn(createFolder);
  const renameFolderFn = useServerFn(renameFolder);
  const deleteFolderFn = useServerFn(deleteFolder);
  const signedUrlFn = useServerFn(createSignedUploadUrl);
  const finalizeFn = useServerFn(finalizeDocument);
  const renameDocFn = useServerFn(renameDocument);
  const deleteDocFn = useServerFn(deleteDocument);
  const downloadFn = useServerFn(getDocumentDownloadUrl);
  const activityFn = useServerFn(listMatterActivity);
  const teamListFn = useServerFn(listMatterAssistants);
  const teamAddFn = useServerFn(addMatterAssistant);
  const teamRemoveFn = useServerFn(removeMatterAssistant);
  const tasksListFn = useServerFn(listTasks);
  const taskCreateFn = useServerFn(createTask);
  const taskUpdateFn = useServerFn(updateTask);
  const taskDeleteFn = useServerFn(deleteTask);
  const signDocLinkFn = useServerFn(createMatterDocumentSignatureLink);
  const session = useSession();
  const uid = session?.user.id;

  const matter = useQuery({ queryKey: ["matter", matterId], queryFn: () => getMatterFn({ data: { id: matterId } }) });
  const tree = useQuery({ queryKey: ["tree", matterId], queryFn: () => treeFn({ data: { matter_id: matterId } }) });
  const activity = useQuery({ queryKey: ["activity", matterId], queryFn: () => activityFn({ data: { matter_id: matterId } }) });
  const team = useQuery({ queryKey: ["team", matterId], queryFn: () => teamListFn({ data: { matter_id: matterId } }) });
  const tasks = useQuery({ queryKey: ["tasks", matterId], queryFn: () => tasksListFn({ data: { matter_id: matterId } }) });
  const listInvoicesFn = useServerFn(listInvoices);
  const quotesQ = useQuery({ queryKey: ["invoices", "matter", matterId, "quote"], queryFn: () => listInvoicesFn({ data: { matter_id: matterId, kind: "quote" } }) });
  const invoicesQ = useQuery({ queryKey: ["invoices", "matter", matterId, "invoice"], queryFn: () => listInvoicesFn({ data: { matter_id: matterId, kind: "invoice" } }) });
  const isOwner = !!uid && matter.data?.owner_id === uid;

  const patchMatter = useMutation({
    mutationFn: (v: { status?: string; title?: string }) => updateMatterFn({ data: { id: matterId, ...(v as any) } }),
    onSuccess: (_r, v) => {
      toast.success(v.title ? "Dossier renommé" : "Statut mis à jour");
      qc.invalidateQueries({ queryKey: ["matter", matterId] });
      qc.invalidateQueries({ queryKey: ["activity", matterId] });
      qc.invalidateQueries({ queryKey: ["matters"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [inviteEmail, setInviteEmail] = useState("");

  const addAssistant = useMutation({
    mutationFn: () => teamAddFn({ data: { matter_id: matterId, email: inviteEmail } }),
    onSuccess: () => { toast.success("Accès partagé"); setInviteEmail(""); qc.invalidateQueries({ queryKey: ["team", matterId] }); qc.invalidateQueries({ queryKey: ["activity", matterId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const removeAssistant = useMutation({
    mutationFn: (userId: string) => teamRemoveFn({ data: { matter_id: matterId, user_id: userId } }),
    onSuccess: () => { toast.success("Accès retiré"); qc.invalidateQueries({ queryKey: ["team", matterId] }); qc.invalidateQueries({ queryKey: ["activity", matterId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const [newTask, setNewTask] = useState({ title: "", description: "", priority: "medium" as "low"|"medium"|"high", due_date: "" });
  const addTask = useMutation({
    mutationFn: () => taskCreateFn({ data: {
      matter_id: matterId,
      title: newTask.title,
      description: newTask.description || null,
      priority: newTask.priority,
      due_date: newTask.due_date || null,
    } }),
    onSuccess: () => { toast.success("Tâche créée"); setNewTask({ title: "", description: "", priority: "medium", due_date: "" }); qc.invalidateQueries({ queryKey: ["tasks", matterId] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const patchTask = useMutation({
    mutationFn: (v: { id: string; status?: "todo"|"doing"|"done"; priority?: "low"|"medium"|"high" }) => taskUpdateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks", matterId] }),
    onError: (e: any) => toast.error(e.message),
  });
  const rmTask = useMutation({
    mutationFn: (id: string) => taskDeleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Tâche supprimée"); qc.invalidateQueries({ queryKey: ["tasks", matterId] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const folders: Folder[] = tree.data?.folders ?? [];
  const documents: Doc[] = tree.data?.documents ?? [];

  const childrenOf = useMemo(() => {
    const map = new Map<string | null, Folder[]>();
    folders.forEach((f) => {
      const key = f.parent_id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    });
    return map;
  }, [folders]);

  const currentDocs = useMemo(() => documents.filter((d) => d.folder_id === currentFolder), [documents, currentFolder]);
  const breadcrumb = useMemo(() => {
    const chain: Folder[] = [];
    let cur = currentFolder;
    while (cur) {
      const f = folders.find((x) => x.id === cur);
      if (!f) break;
      chain.unshift(f);
      cur = f.parent_id;
    }
    return chain;
  }, [currentFolder, folders]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tree", matterId] });
    qc.invalidateQueries({ queryKey: ["activity", matterId] });
  };

  const mkFolder = useMutation({
    mutationFn: (name: string) => createFolderFn({ data: { matter_id: matterId, parent_id: currentFolder, name } }),
    onSuccess: () => { toast.success("Sous-dossier créé"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rnFolder = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolderFn({ data: { id, name } }),
    onSuccess: () => { toast.success("Renommé"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rmFolder = useMutation({
    mutationFn: (id: string) => deleteFolderFn({ data: { id } }),
    onSuccess: () => { toast.success("Supprimé"); setCurrentFolder(null); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rnDoc = useMutation({
    mutationFn: ({ id, filename }: { id: string; filename: string }) => renameDocFn({ data: { id, filename } }),
    onSuccess: () => { toast.success("Renommé"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const rmDoc = useMutation({
    mutationFn: (id: string) => deleteDocFn({ data: { id } }),
    onSuccess: () => { toast.success("Supprimé"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const signDoc = useMutation({
    mutationFn: (documentId: string) => signDocLinkFn({
      data: {
        document_id: documentId,
        origin: window.location.origin,
      },
    }),
    onSuccess: async (res: any) => {
      try {
        await navigator.clipboard.writeText(String(res.url));
        toast.success("Lien de signature créé et copié");
      } catch {
        toast.success("Lien de signature créé");
      }
      window.open(String(res.url), "_blank", "noopener,noreferrer");
    },
    onError: (e: any) => toast.error(e.message ?? "Impossible de créer le lien de signature"),
  });

  async function uploadFile(file: File) {
    try {
      const meta = await signedUrlFn({ data: {
        matter_id: matterId,
        folder_id: currentFolder,
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      }});
      const putRes = await fetch(meta.signed_url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
      if (!putRes.ok) throw new Error(`Upload échoué (${putRes.status})`);
      await finalizeFn({ data: {
        doc_id: meta.doc_id,
        matter_id: matterId,
        folder_id: currentFolder,
        filename: file.name,
        storage_path: meta.path,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      }});
      toast.success(`${file.name} importé`);
    } catch (e: any) {
      toast.error(e.message || "Erreur d'import");
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      // eslint-disable-next-line no-await-in-loop
      await uploadFile(f);
    }
    invalidate();
  }

  async function handleDownload(id: string) {
    try {
      const { url } = await downloadFn({ data: { id } });
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  }

  function FolderNode({ folder, depth }: { folder: Folder; depth: number }) {
    const kids = childrenOf.get(folder.id) ?? [];
    const isOpen = expanded[folder.id];
    return (
      <div>
        <div
          className={`flex items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-secondary/50 ${currentFolder === folder.id ? "bg-secondary text-navy font-semibold" : ""}`}
          style={{ paddingLeft: 4 + depth * 12 }}
        >
          <button onClick={() => setExpanded({ ...expanded, [folder.id]: !isOpen })} aria-label="Déplier" className="shrink-0">
            {kids.length > 0 ? (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />) : <span className="inline-block h-3.5 w-3.5" />}
          </button>
          <button onClick={() => setCurrentFolder(folder.id)} className="flex flex-1 items-center gap-1.5 truncate text-left">
            <Folder className="h-4 w-4 text-gold" />
            <span className="truncate">{folder.name}</span>
          </button>
          <button
            onClick={() => { const n = prompt("Nouveau nom", folder.name); if (n) rnFolder.mutate({ id: folder.id, name: n }); }}
            aria-label="Renommer" className="opacity-0 hover:opacity-100 group-hover:opacity-100"
          ><Pencil className="h-3 w-3" /></button>
          <button
            onClick={() => { if (confirm(`Supprimer le sous-dossier « ${folder.name} » et son contenu ?`)) rmFolder.mutate(folder.id); }}
            aria-label="Supprimer"
          ><Trash2 className="h-3 w-3 text-destructive" /></button>
        </div>
        {isOpen && kids.map((k) => <FolderNode key={k.id} folder={k} depth={depth + 1} />)}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow={matter.data?.number ?? "Dossier"}
        title={matter.data?.title ?? "Chargement…"}
        description={matter.data?.clients ? `Client : ${matter.data.clients.first_name} ${matter.data.clients.last_name}` : undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={matter.data?.status ?? "open"}
            onValueChange={(v) => patchMatter.mutate({ status: v })}
            disabled={!matter.data || patchMatter.isPending}
          >
            <SelectTrigger className="w-44 border-white/40 bg-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATTER_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  <span className="inline-flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${matterStatusMeta(s).dot}`} />
                    {matterStatusMeta(s).label}
                  </span>
                </SelectItem>
              ))}
              {matter.data?.status === "archived" && <SelectItem value="archived">Archivé</SelectItem>}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="sm"
            className="border-white text-white hover:bg-white hover:text-navy"
            disabled={!matter.data || patchMatter.isPending}
            onClick={() => {
              const n = prompt("Nouvel intitulé du dossier", matter.data?.title ?? "");
              if (n && n.trim().length >= 2 && n.trim() !== matter.data?.title) patchMatter.mutate({ title: n.trim() });
            }}
          >
            <Pencil className="mr-1.5 h-4 w-4" />Renommer
          </Button>
          <Button asChild variant="outline" size="sm" className="border-white text-white hover:bg-white hover:text-navy">
            <Link to="/dossiers"><ArrowLeft className="mr-1.5 h-4 w-4" />Retour</Link>
          </Button>
        </div>
      </PageHeader>

      <section className="container-page py-8">
        {matter.data && (
          <p className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${matterStatusMeta(matter.data.status).badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${matterStatusMeta(matter.data.status).dot}`} />
              {matterStatusMeta(matter.data.status).label}
            </span>
            <span>
              Créé par {matter.data.owner_name ?? "—"}
              {matter.data.updated_by_name ? ` · Dernière modification par ${matter.data.updated_by_name}` : ""}
              {matter.data.updated_at ? ` le ${new Date(matter.data.updated_at).toLocaleString("fr-FR")}` : ""}
            </span>
          </p>
        )}


        <Tabs defaultValue="files">
          <TabsList>
            <TabsTrigger value="files">Fichiers</TabsTrigger>
            <TabsTrigger value="tasks"><CheckSquare className="mr-1.5 h-4 w-4" />Tâches</TabsTrigger>
            <TabsTrigger value="quotes"><FileSignature className="mr-1.5 h-4 w-4" />Devis</TabsTrigger>
            <TabsTrigger value="invoices"><Receipt className="mr-1.5 h-4 w-4" />Factures</TabsTrigger>
            <TabsTrigger value="team"><Users className="mr-1.5 h-4 w-4" />Équipe</TabsTrigger>
            <TabsTrigger value="activity"><Activity className="mr-1.5 h-4 w-4" />Activité</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="mt-4">
            <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
              <Card className="shadow-[var(--shadow-card)]">
                <CardContent className="p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Arborescence</div>
                    <Button
                      size="sm" variant="ghost"
                      onClick={() => { const n = prompt("Nom du sous-dossier"); if (n) mkFolder.mutate(n); }}
                    ><FolderPlus className="h-4 w-4" /></Button>
                  </div>
                  <button
                    onClick={() => setCurrentFolder(null)}
                    className={`flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm hover:bg-secondary/50 ${currentFolder === null ? "bg-secondary text-navy font-semibold" : ""}`}
                  >
                    <Folder className="h-4 w-4 text-gold" />
                    Racine du dossier
                  </button>
                  {(childrenOf.get(null) ?? []).map((f) => <FolderNode key={f.id} folder={f} depth={0} />)}
                  {folders.length === 0 && <div className="mt-3 text-xs text-muted-foreground">Aucun sous-dossier</div>}
                </CardContent>
              </Card>

              <Card className="shadow-[var(--shadow-card)]">
                <CardContent className="p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Emplacement :</span>
                    <button className="text-navy hover:underline" onClick={() => setCurrentFolder(null)}>Racine</button>
                    {breadcrumb.map((f) => (
                      <span key={f.id} className="flex items-center gap-1">
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <button className="text-navy hover:underline" onClick={() => setCurrentFolder(f.id)}>{f.name}</button>
                      </span>
                    ))}
                    <div className="ml-auto flex gap-2">
                      <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
                      <Button size="sm" onClick={() => fileInputRef.current?.click()} className="bg-navy text-white hover:bg-navy-deep">
                        <Upload className="mr-1.5 h-4 w-4" />Importer
                      </Button>
                    </div>
                  </div>

                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                    className="rounded-lg border-2 border-dashed border-border p-3"
                  >
                    {currentDocs.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Glissez-déposez des fichiers ici (PDF, DOCX, XLSX, JPG, PNG, ZIP — max 25 Mo)
                      </div>
                    ) : (
                      <ul className="divide-y divide-border">
                        {currentDocs.map((d) => {
                          const Icon = mimeIcon(d.mime_type);
                          return (
                            <li key={d.id} className="flex items-center gap-3 py-2">
                              <div className="grid h-9 w-9 place-items-center rounded-md bg-secondary text-navy"><Icon className="h-4 w-4" /></div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-medium">{d.filename}</div>
                                <div className="text-xs text-muted-foreground">{formatSize(d.size_bytes)} · {new Date(d.created_at).toLocaleString("fr-FR")}</div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => signDoc.mutate(d.id)}
                                disabled={signDoc.isPending}
                              >
                                <FileSignature className="mr-1.5 h-4 w-4" />Faire signer
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDownload(d.id)} aria-label="Télécharger"><Download className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => { const n = prompt("Nouveau nom", d.filename); if (n) rnDoc.mutate({ id: d.id, filename: n }); }} aria-label="Renommer"><Pencil className="h-4 w-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Supprimer « ${d.filename} » ?`)) rmDoc.mutate(d.id); }} aria-label="Supprimer"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {(["quote", "invoice"] as const).map((k) => {
            const q = k === "quote" ? quotesQ : invoicesQ;
            const label = k === "quote" ? "Devis" : "Factures";
            return (
              <TabsContent key={k} value={k === "quote" ? "quotes" : "invoices"} className="mt-4">
                <Card className="shadow-[var(--shadow-card)]">
                  <CardContent className="p-4">
                    {((q.data ?? []) as any[]).length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        Aucun {label.toLowerCase()} rattaché à ce dossier.
                      </div>
                    ) : (
                      <ul className="divide-y divide-border">
                        {((q.data ?? []) as any[]).map((inv) => (
                          <li key={inv.id} className="flex items-center gap-3 py-2 text-sm">
                            <span className="font-mono text-xs text-muted-foreground w-32 shrink-0">{inv.number}</span>
                            <span className="flex-1 truncate">
                              {[inv.client_snapshot?.first_name, inv.client_snapshot?.last_name].filter(Boolean).join(" ") || "—"}
                            </span>
                            <span className="text-xs text-muted-foreground">{inv.issue_date}</span>
                            <span className="font-mono font-semibold w-28 text-right">{Number(inv.total).toFixed(2)} {inv.currency}</span>
                            <Button asChild size="sm" variant="ghost">
                              <Link to="/facturation/$id" params={{ id: inv.id }}>
                                <ExternalLink className="h-4 w-4" />
                              </Link>
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            );
          })}


          <TabsContent value="activity" className="mt-4">
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-4">
                {(activity.data ?? []).length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Aucune activité pour l'instant.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {(activity.data ?? []).map((a: any) => (
                      <li key={a.id} className="py-3 text-sm">
                        <div className="font-medium text-navy-deep">{a.summary}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString("fr-FR")} · par {a.actor_name ?? "Utilisateur"} · {a.action}
                        </div>
                      </li>
                    ))}

                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-4 space-y-4">
                <div className="grid gap-2 rounded-lg border border-border p-3 md:grid-cols-[1fr_180px_160px_auto]">
                  <Input placeholder="Nouvelle tâche…" value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
                  <Select value={newTask.priority} onValueChange={(v: any) => setNewTask({ ...newTask, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Priorité basse</SelectItem>
                      <SelectItem value="medium">Priorité moyenne</SelectItem>
                      <SelectItem value="high">Priorité haute</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="date" value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
                  <Button
                    onClick={() => addTask.mutate()}
                    disabled={!newTask.title.trim() || addTask.isPending}
                    className="bg-navy text-white hover:bg-navy-deep"
                  ><Plus className="mr-1.5 h-4 w-4" />Ajouter</Button>
                  <Textarea
                    placeholder="Description (optionnelle)"
                    value={newTask.description}
                    onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    className="md:col-span-4"
                  />
                </div>

                {(tasks.data ?? []).length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Aucune tâche pour ce dossier.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {(tasks.data ?? []).map((t: any) => {
                      const overdue = t.due_date && t.status !== "done" && new Date(t.due_date) < new Date(new Date().toDateString());
                      return (
                        <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                          <Select
                            value={t.status}
                            onValueChange={(v: any) => patchTask.mutate({ id: t.id, status: v })}
                          >
                            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todo">À faire</SelectItem>
                              <SelectItem value="doing">En cours</SelectItem>
                              <SelectItem value="done">Terminée</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="min-w-0 flex-1">
                            <div className={`font-medium ${t.status === "done" ? "line-through text-muted-foreground" : "text-navy-deep"}`}>{t.title}</div>
                            {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                          </div>
                          <Badge variant={t.priority === "high" ? "destructive" : t.priority === "medium" ? "default" : "secondary"}>
                            {t.priority === "high" ? "Haute" : t.priority === "medium" ? "Moyenne" : "Basse"}
                          </Badge>
                          {t.due_date && (
                            <span className={`text-xs ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                              {new Date(t.due_date).toLocaleDateString("fr-FR")}
                            </span>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => { if (confirm("Supprimer cette tâche ?")) rmTask.mutate(t.id); }} aria-label="Supprimer">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="mt-4">
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="p-4 space-y-4">
                <div className="text-sm text-muted-foreground">
                  Partagez l'accès à ce dossier avec un assistant juridique ou un confrère. Les personnes ajoutées peuvent consulter, importer des documents et gérer les tâches — seul le titulaire peut clôturer le dossier.
                </div>
                {isOwner && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
                    <UserPlus className="h-4 w-4 text-navy" />
                    <Input
                      placeholder="Email du collaborateur"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="min-w-[240px] flex-1"
                    />
                    <Button
                      onClick={() => addAssistant.mutate()}
                      disabled={!inviteEmail.trim() || addAssistant.isPending}
                      className="bg-navy text-white hover:bg-navy-deep"
                    >Partager l'accès</Button>
                  </div>
                )}
                {(team.data ?? []).length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Aucun accès partagé.</div>
                ) : (
                  <ul className="divide-y divide-border">
                    {(team.data ?? []).map((a: any) => (
                      <li key={a.user_id} className="flex items-center gap-3 py-2">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-navy text-sm font-semibold">
                          {(a.full_name ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium text-navy-deep">{a.full_name}</div>
                          <div className="text-xs text-muted-foreground">Accès depuis le {new Date(a.created_at).toLocaleDateString("fr-FR")}</div>
                        </div>
                        {isOwner && (
                          <Button size="sm" variant="ghost" onClick={() => { if (confirm("Retirer l'accès ?")) removeAssistant.mutate(a.user_id); }}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>
    </>
  );
}
