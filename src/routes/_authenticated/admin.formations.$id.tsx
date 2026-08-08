import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Loader2, Save, Plus, Trash2, ArrowLeft, ArrowUp, ArrowDown, Pencil,
  CheckCircle2, XCircle, Award, FileDown,
} from "lucide-react";
import {
  getTrainingAdmin, upsertTraining, listTrainingCategories,
  upsertTrainingModule, deleteTrainingModule, reorderModules,
  upsertTrainingQuestion, deleteTrainingQuestion,
  listAttempts, adjustAttemptScore,
} from "@/lib/trainings-admin.functions";
import { renderTrainingCertificate } from "@/lib/certificate.functions";

export const Route = createFileRoute("/_authenticated/admin/formations/$id")({
  head: () => ({ meta: [{ title: "Éditeur — Formations" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getTrainingAdmin);
  const catFn = useServerFn(listTrainingCategories);
  const query = useQuery({ queryKey: ["adm-training", id], queryFn: () => getFn({ data: { id } }) });
  const cats = useQuery({ queryKey: ["adm-tr-cats"], queryFn: () => catFn() });

  if (query.isLoading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-navy" /></div>;
  if (!query.data?.training) return <div className="py-16 text-center text-muted-foreground">Formation introuvable. <Link className="underline" to="/admin/formations">Retour</Link></div>;

  const t: any = query.data.training;
  const modules: any[] = query.data.modules;
  const questions: any[] = query.data.questions;
  const choices: any[] = query.data.choices;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild><Link to="/admin/formations"><ArrowLeft className="mr-1 h-4 w-4" />Retour</Link></Button>
          <h2 className="mt-1 font-display text-xl font-bold text-navy-deep">{t.title}</h2>
          <p className="text-xs text-muted-foreground">/{t.slug} · {t.status}</p>
        </div>
      </div>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="modules">Modules & chapitres ({modules.length})</TabsTrigger>
          <TabsTrigger value="questions">Questionnaire ({questions.length})</TabsTrigger>
          <TabsTrigger value="results">Résultats</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <GeneralTab t={t} cats={(cats.data ?? []) as any[]} refetch={() => qc.invalidateQueries({ queryKey: ["adm-training", id] })} />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesTab trainingId={id} modules={modules} refetch={() => qc.invalidateQueries({ queryKey: ["adm-training", id] })} />
        </TabsContent>
        <TabsContent value="questions">
          <QuestionsTab trainingId={id} questions={questions} choices={choices} refetch={() => qc.invalidateQueries({ queryKey: ["adm-training", id] })} />
        </TabsContent>
        <TabsContent value="results">
          <ResultsTab trainingId={id} passThreshold={t.pass_threshold} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralTab({ t, cats, refetch }: { t: any; cats: any[]; refetch: () => void }) {
  const [f, setF] = useState({ ...t });
  useEffect(() => setF({ ...t }), [t.id]);
  const saveFn = useServerFn(upsertTraining);
  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      id: f.id, title: f.title, slug: f.slug,
      description: f.description ?? null,
      category_id: f.category_id ?? null,
      points: Number(f.points ?? 0),
      pass_threshold: Number(f.pass_threshold ?? 70),
      duration_min: Number(f.duration_min ?? 30),
      cover_url: f.cover_url || null,
      status: f.status,
    }}),
    onSuccess: () => { toast.success("Enregistré"); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card className="shadow-[var(--shadow-card)]"><CardContent className="grid gap-4 p-6 sm:grid-cols-2">
      <div className="sm:col-span-2"><Label>Titre *</Label><Input value={f.title ?? ""} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
      <div><Label>Slug</Label><Input value={f.slug ?? ""} onChange={(e) => setF({ ...f, slug: e.target.value })} /></div>
      <div><Label>Statut</Label>
        <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">Brouillon</SelectItem>
            <SelectItem value="published">Publiée</SelectItem>
            <SelectItem value="archived">Archivée</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label>Catégorie</Label>
        <Select value={f.category_id ?? "none"} onValueChange={(v) => setF({ ...f, category_id: v === "none" ? null : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Aucune —</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>Points accordés</Label><Input type="number" min={0} value={f.points ?? 0} onChange={(e) => setF({ ...f, points: e.target.value })} /></div>
      <div><Label>Seuil de réussite (%)</Label><Input type="number" min={0} max={100} value={f.pass_threshold ?? 70} onChange={(e) => setF({ ...f, pass_threshold: e.target.value })} /></div>
      <div><Label>Durée (min)</Label><Input type="number" min={1} value={f.duration_min ?? 30} onChange={(e) => setF({ ...f, duration_min: e.target.value })} /></div>
      <div className="sm:col-span-2"><Label>Image de couverture (URL)</Label><Input value={f.cover_url ?? ""} onChange={(e) => setF({ ...f, cover_url: e.target.value })} placeholder="https://…" /></div>
      <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={4} value={f.description ?? ""} onChange={(e) => setF({ ...f, description: e.target.value })} /></div>
      <div className="sm:col-span-2 flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending} className="bg-navy text-white">
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Enregistrer
        </Button>
      </div>
    </CardContent></Card>
  );
}

function ModulesTab({ trainingId, modules, refetch }: { trainingId: string; modules: any[]; refetch: () => void }) {
  const [edit, setEdit] = useState<any | null>(null);
  const upFn = useServerFn(upsertTrainingModule);
  const delFn = useServerFn(deleteTrainingModule);
  const reFn = useServerFn(reorderModules);

  const save = useMutation({
    mutationFn: () => upFn({ data: {
      id: edit.id, training_id: trainingId,
      title: edit.title, content: edit.content ?? null, video_url: edit.video_url || null,
      position: edit.position ?? modules.length,
    }}),
    onSuccess: () => { toast.success("Module enregistré"); setEdit(null); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Module supprimé"); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const move = async (idx: number, dir: -1 | 1) => {
    const arr = [...modules];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    await reFn({ data: { ids: arr.map((m) => m.id) } });
    refetch();
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={() => setEdit({ title: "", content: "", video_url: "", position: modules.length })} className="bg-navy text-white"><Plus className="mr-2 h-4 w-4" />Ajouter un module</Button></div>
      {modules.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucun module. Ajoutez le premier chapitre.</CardContent></Card>
      : modules.map((m, i) => (
        <Card key={m.id}><CardContent className="flex items-start gap-3 p-4">
          <div className="grid gap-1">
            <button onClick={() => move(i, -1)} disabled={i === 0} className="text-muted-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
            <button onClick={() => move(i, 1)} disabled={i === modules.length - 1} className="text-muted-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2"><Badge variant="outline">Module {i + 1}</Badge><span className="font-medium">{m.title}</span></div>
            {m.video_url && <div className="mt-1 truncate text-xs text-muted-foreground">Vidéo : {m.video_url}</div>}
            {m.content && <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{m.content}</p>}
          </div>
          <div>
            <Button size="icon" variant="ghost" onClick={() => setEdit(m)}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => confirm(`Supprimer "${m.title}" ?`) && remove.mutate(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        </CardContent></Card>
      ))}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifier le module" : "Nouveau module"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div><Label>Titre *</Label><Input value={edit.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
              <div><Label>Vidéo (URL embed, optionnel)</Label><Input value={edit.video_url ?? ""} onChange={(e) => setEdit({ ...edit, video_url: e.target.value })} placeholder="https://www.youtube.com/embed/…" /></div>
              <div><Label>Contenu du chapitre</Label><Textarea rows={10} value={edit.content ?? ""} onChange={(e) => setEdit({ ...edit, content: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
            <Button disabled={!edit?.title?.trim() || save.isPending} onClick={() => save.mutate()} className="bg-navy text-white">Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionsTab({ trainingId, questions, choices, refetch }: { trainingId: string; questions: any[]; choices: any[]; refetch: () => void }) {
  const [edit, setEdit] = useState<any | null>(null);
  const upFn = useServerFn(upsertTrainingQuestion);
  const delFn = useServerFn(deleteTrainingQuestion);

  const openNew = () => setEdit({
    prompt: "", kind: "single", position: questions.length,
    choices: [{ label: "", is_correct: true }, { label: "", is_correct: false }],
  });
  const openEdit = (q: any) => setEdit({
    ...q,
    choices: choices.filter((c) => c.question_id === q.id).sort((a, b) => a.position - b.position),
  });

  const save = useMutation({
    mutationFn: () => upFn({ data: {
      id: edit.id, training_id: trainingId,
      prompt: edit.prompt, kind: edit.kind, position: edit.position ?? 0,
      choices: edit.choices.map((c: any, i: number) => ({
        id: c.id, label: c.label, is_correct: !!c.is_correct, position: i,
      })),
    }}),
    onSuccess: () => { toast.success("Question enregistrée"); setEdit(null); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Question supprimée"); refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button onClick={openNew} className="bg-navy text-white"><Plus className="mr-2 h-4 w-4" />Ajouter une question</Button></div>
      {questions.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Aucune question. Ajoutez le premier item du QCM.</CardContent></Card>
      : questions.map((q, i) => {
        const qc = choices.filter((c) => c.question_id === q.id);
        return (
          <Card key={q.id}><CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><Badge variant="outline">Q{i + 1}</Badge><Badge className="bg-gold/15 text-navy-deep hover:bg-gold/15">{q.kind === "multi" ? "Multi" : q.kind === "boolean" ? "V/F" : "QCM"}</Badge></div>
                <div className="mt-1 font-medium">{q.prompt}</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {qc.map((c) => (
                    <li key={c.id} className="flex items-center gap-2">
                      {c.is_correct ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className={c.is_correct ? "font-medium" : "text-muted-foreground"}>{c.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(q)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => confirm("Supprimer cette question ?") && remove.mutate(q.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </div>
          </CardContent></Card>
        );
      })}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? "Modifier la question" : "Nouvelle question"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div><Label>Énoncé *</Label><Textarea rows={3} value={edit.prompt ?? ""} onChange={(e) => setEdit({ ...edit, prompt: e.target.value })} /></div>
              <div><Label>Type</Label>
                <Select value={edit.kind} onValueChange={(v) => setEdit({ ...edit, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">QCM à réponse unique</SelectItem>
                    <SelectItem value="multi">QCM à réponses multiples</SelectItem>
                    <SelectItem value="boolean">Vrai / Faux</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <Label>Réponses</Label>
                  <Button size="sm" variant="outline" onClick={() => setEdit({ ...edit, choices: [...edit.choices, { label: "", is_correct: false }] })} disabled={edit.choices.length >= 10}><Plus className="mr-1 h-3 w-3" />Ajouter</Button>
                </div>
                <div className="space-y-2">
                  {edit.choices.map((c: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 rounded-md border p-2">
                      <Checkbox checked={!!c.is_correct} onCheckedChange={(v) => {
                        const arr = [...edit.choices];
                        if (edit.kind === "single" || edit.kind === "boolean") {
                          arr.forEach((x: any, k: number) => x.is_correct = k === idx ? !!v : false);
                        } else {
                          arr[idx] = { ...c, is_correct: !!v };
                        }
                        setEdit({ ...edit, choices: arr });
                      }} />
                      <Input className="flex-1" value={c.label} onChange={(e) => {
                        const arr = [...edit.choices]; arr[idx] = { ...c, label: e.target.value }; setEdit({ ...edit, choices: arr });
                      }} placeholder="Libellé de la réponse" />
                      <Button size="icon" variant="ghost" onClick={() => {
                        if (edit.choices.length <= 2) return toast.error("Minimum 2 réponses");
                        const arr = edit.choices.filter((_: any, k: number) => k !== idx);
                        setEdit({ ...edit, choices: arr });
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Cochez les réponses correctes.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Annuler</Button>
            <Button disabled={!edit?.prompt?.trim() || edit?.choices?.some((c: any) => !c.label?.trim()) || save.isPending} onClick={() => save.mutate()} className="bg-navy text-white">Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResultsTab({ trainingId, passThreshold }: { trainingId: string; passThreshold: number }) {
  const listFn = useServerFn(listAttempts);
  const adjFn = useServerFn(adjustAttemptScore);
  const certFn = useServerFn(renderTrainingCertificate);
  const qc = useQueryClient();
  const [adj, setAdj] = useState<any | null>(null);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");

  const attempts = useQuery({ queryKey: ["adm-attempts", trainingId], queryFn: () => listFn({ data: { training_id: trainingId } }) });

  const doAdjust = useMutation({
    mutationFn: () => adjFn({ data: { attempt_id: adj.id, delta_points: delta, reason: reason || undefined } }),
    onSuccess: () => { toast.success("Score ajusté"); setAdj(null); setDelta(0); setReason(""); qc.invalidateQueries({ queryKey: ["adm-attempts", trainingId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const genCert = useMutation({
    mutationFn: (id: string) => certFn({ data: { attempt_id: id, origin: window.location.origin } }),
    onSuccess: (r: any) => {
      const bin = atob(r.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const blob = new Blob([arr], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="shadow-[var(--shadow-card)]"><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Avocat</TableHead><TableHead>Licence</TableHead><TableHead>Score</TableHead><TableHead>%</TableHead><TableHead>Résultat</TableHead><TableHead>Date</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {attempts.isLoading ? <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
          : (attempts.data ?? []).length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Aucune tentative pour l'instant.</TableCell></TableRow>
          : (attempts.data as any[]).map((a) => {
            const pct = a.max_score > 0 ? Math.round((a.points_awarded / a.max_score) * 100) : 0;
            return (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.lawyer ? `Me ${a.lawyer.first_name} ${a.lawyer.last_name}` : "—"}</TableCell>
                <TableCell className="text-xs">{a.lawyer?.license ?? "—"}</TableCell>
                <TableCell>{a.points_awarded} / {a.max_score}</TableCell>
                <TableCell>{pct}%</TableCell>
                <TableCell>{a.passed ? <Badge className="bg-success/15 text-success hover:bg-success/20">Validée</Badge> : <Badge variant="destructive">Échec</Badge>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{new Date(a.submitted_at).toLocaleString("fr-FR")}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setAdj(a)}>Ajuster</Button>
                  {a.passed && <Button size="sm" variant="outline" onClick={() => genCert.mutate(a.id)} disabled={genCert.isPending}><Award className="mr-1 h-4 w-4" />Certificat</Button>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Dialog open={!!adj} onOpenChange={(o) => !o && setAdj(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Ajustement manuel du score</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <p className="text-sm text-muted-foreground">Score actuel : <b>{adj?.points_awarded} / {adj?.max_score}</b> (seuil {passThreshold}%)</p>
            <div><Label>Points à ajouter (positif ou négatif)</Label><Input type="number" value={delta} onChange={(e) => setDelta(Number(e.target.value))} /></div>
            <div><Label>Motif</Label><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Justification de l'ajustement (traçée dans le journal)." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdj(null)}>Annuler</Button>
            <Button onClick={() => doAdjust.mutate()} disabled={doAdjust.isPending} className="bg-navy text-white">Appliquer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CardContent></Card>
  );
}
