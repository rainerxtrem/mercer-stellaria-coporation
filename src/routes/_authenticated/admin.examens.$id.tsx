import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  getExam, upsertExam, regenerateAccessCode,
  upsertQuestion, deleteQuestion, duplicateQuestion,
  upsertChoice, deleteChoice, listAttempts,
} from "@/lib/bar-exams.functions";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Copy, RefreshCw, Trash2, Plus, Files, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/examens/$id")({
  head: () => ({ meta: [{ title: "Éditeur d'examen — CEO" }] }),
  component: () => (<AdminGuard><ExamEditor /></AdminGuard>),
});

const QTYPES: Record<string, string> = { single: "Choix unique", multiple: "Choix multiples", truefalse: "Vrai / Faux", short: "Réponse courte", essay: "Cas pratique" };

function ExamEditor() {
  const { id } = Route.useParams();
  const load = useServerFn(getExam);
  const [state, setState] = useState<any>(null);
  const refresh = async () => setState(await load({ data: { id } }));
  useEffect(() => { refresh(); }, [id]);
  if (!state) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{state.exam.name}</h1>
          <div className="text-xs text-muted-foreground flex gap-2 items-center">
            <Badge variant="secondary">{state.exam.status}</Badge>
            <span>{state.questions.length} questions • {Number(state.exam.total_points).toFixed(0)} pts</span>
          </div>
        </div>
        <Button variant="outline" asChild><Link to={"/admin/examens" as any}>← Retour</Link></Button>
      </div>

      <Tabs defaultValue="params">
        <TabsList>
          <TabsTrigger value="params">Paramètres</TabsTrigger>
          <TabsTrigger value="code">Code d'accès</TabsTrigger>
          <TabsTrigger value="questions">Questions ({state.questions.length})</TabsTrigger>
          <TabsTrigger value="results">Résultats</TabsTrigger>
        </TabsList>
        <TabsContent value="params"><ParamsTab exam={state.exam} onSaved={refresh} /></TabsContent>
        <TabsContent value="code"><CodeTab exam={state.exam} onChanged={refresh} /></TabsContent>
        <TabsContent value="questions"><QuestionsTab state={state} onRefresh={refresh} /></TabsContent>
        <TabsContent value="results"><ResultsTab examId={id} /></TabsContent>
      </Tabs>
    </div>
  );
}

function ParamsTab({ exam, onSaved }: { exam: any; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: exam.name || "",
    description: exam.description || "",
    duration_min: exam.duration_min,
    opens_at: exam.opens_at ? exam.opens_at.slice(0, 16) : "",
    closes_at: exam.closes_at ? exam.closes_at.slice(0, 16) : "",
    pass_threshold_pct: exam.pass_threshold_pct,
    max_attempts: exam.max_attempts,
    show_results_to_candidate: exam.show_results_to_candidate,
    auto_publish_results: exam.auto_publish_results,
    shuffle_questions: exam.shuffle_questions,
    shuffle_answers: exam.shuffle_answers,
  });
  const save = useServerFn(upsertExam);
  return (
    <Card><CardContent className="p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Nom</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label>Durée (min)</Label><Input type="number" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: Number(e.target.value) })} /></div>
      </div>
      <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Ouverture</Label><Input type="datetime-local" value={form.opens_at} onChange={(e) => setForm({ ...form, opens_at: e.target.value })} /></div>
        <div><Label>Fermeture</Label><Input type="datetime-local" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Seuil de réussite (%)</Label><Input type="number" value={form.pass_threshold_pct} onChange={(e) => setForm({ ...form, pass_threshold_pct: Number(e.target.value) })} /></div>
        <div><Label>Tentatives autorisées</Label><Input type="number" value={form.max_attempts} onChange={(e) => setForm({ ...form, max_attempts: Number(e.target.value) })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["show_results_to_candidate", "Afficher les résultats au candidat"],
          ["auto_publish_results", "Publier automatiquement les résultats"],
          ["shuffle_questions", "Mélanger les questions"],
          ["shuffle_answers", "Mélanger les réponses"],
        ].map(([k, label]) => (
          <div key={k} className="flex items-center justify-between rounded border p-2">
            <Label className="text-sm">{label}</Label>
            <Switch checked={(form as any)[k]} onCheckedChange={(v) => setForm({ ...form, [k]: v })} />
          </div>
        ))}
      </div>
      <Button onClick={async () => {
        try {
          await save({ data: {
            id: exam.id, name: form.name, description: form.description,
            duration_min: form.duration_min,
            opens_at: form.opens_at ? new Date(form.opens_at).toISOString() : null,
            closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
            pass_threshold_pct: form.pass_threshold_pct, max_attempts: form.max_attempts,
            show_results_to_candidate: form.show_results_to_candidate,
            auto_publish_results: form.auto_publish_results,
            shuffle_questions: form.shuffle_questions,
            shuffle_answers: form.shuffle_answers,
          } });
          toast.success("Sauvegardé"); onSaved();
        } catch (e: any) { toast.error(e?.message || "Erreur"); }
      }}>Enregistrer</Button>
    </CardContent></Card>
  );
}

function CodeTab({ exam, onChanged }: { exam: any; onChanged: () => void }) {
  const regen = useServerFn(regenerateAccessCode);
  return (
    <Card><CardContent className="p-6 space-y-4">
      <p className="text-sm text-muted-foreground">Ce code est visible uniquement ici. Communiquez-le aux candidats au moment de l'examen.</p>
      <div className="flex items-center gap-3">
        <div className="font-mono text-3xl font-bold tracking-widest rounded-lg border px-6 py-3 bg-secondary">
          {exam.access_code}
        </div>
        <Button variant="outline" onClick={() => { navigator.clipboard.writeText(exam.access_code); toast.success("Copié"); }}><Copy className="h-4 w-4 mr-1" />Copier</Button>
        <Button variant="outline" onClick={async () => { await regen({ data: { id: exam.id } }); toast.success("Nouveau code généré"); onChanged(); }}><RefreshCw className="h-4 w-4 mr-1" />Régénérer</Button>
      </div>
      <p className="text-xs text-muted-foreground">Actif : <Badge variant={exam.access_code_active ? "default" : "secondary"}>{exam.access_code_active ? "Oui" : "Non"}</Badge></p>
    </CardContent></Card>
  );
}

function QuestionsTab({ state, onRefresh }: { state: any; onRefresh: () => void }) {
  const add = useServerFn(upsertQuestion);
  return (
    <div className="space-y-3">
      <Button size="sm" onClick={async () => {
        await add({ data: { exam_id: state.exam.id, prompt: "Nouvelle question", type: "single", points: 1 } });
        onRefresh();
      }}><Plus className="h-4 w-4 mr-1" />Ajouter une question</Button>
      {state.questions.length === 0 && <p className="text-sm text-muted-foreground">Aucune question. Ajoutez-en pour construire l'examen.</p>}
      {state.questions.map((q: any, idx: number) => (
        <QuestionEditor key={q.id} q={q} idx={idx} examId={state.exam.id}
          choices={state.choices.filter((c: any) => c.question_id === q.id)} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

function QuestionEditor({ q, idx, examId, choices, onRefresh }: { q: any; idx: number; examId: string; choices: any[]; onRefresh: () => void }) {
  const [form, setForm] = useState({ prompt: q.prompt, type: q.type, points: Number(q.points), category: q.category || "", explanation: q.explanation || "" });
  const save = useServerFn(upsertQuestion);
  const del = useServerFn(deleteQuestion);
  const dup = useServerFn(duplicateQuestion);
  const saveChoice = useServerFn(upsertChoice);
  const delChoice = useServerFn(deleteChoice);

  const isChoiceType = form.type === "single" || form.type === "multiple" || form.type === "truefalse";

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Question {idx + 1}</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={async () => { await dup({ data: { id: q.id } }); onRefresh(); }}><Files className="h-4 w-4" /></Button>
          <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Supprimer ?")) { await del({ data: { id: q.id } }); onRefresh(); } }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={2} />
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(QTYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Points</Label><Input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} /></div>
          <div><Label className="text-xs">Catégorie</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
        </div>
        <div><Label className="text-xs">Explication (facultative)</Label><Textarea rows={2} value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} /></div>
        <div className="flex gap-2">
          <Button size="sm" onClick={async () => {
            await save({ data: { id: q.id, exam_id: examId, prompt: form.prompt, type: form.type as any, points: form.points, category: form.category || null, explanation: form.explanation || null } });
            toast.success("Question sauvegardée"); onRefresh();
          }}>Enregistrer</Button>
        </div>

        {isChoiceType && (
          <div className="mt-3 space-y-1 border-t pt-3">
            <Label className="text-xs">Réponses</Label>
            {choices.sort((a, b) => a.position - b.position).map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <Button size="sm" variant={c.is_correct ? "default" : "outline"} onClick={async () => {
                  await saveChoice({ data: { id: c.id, question_id: q.id, label: c.label, is_correct: !c.is_correct } });
                  onRefresh();
                }}>{c.is_correct ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-30" />}</Button>
                <Input defaultValue={c.label} onBlur={async (e) => {
                  if (e.target.value !== c.label) { await saveChoice({ data: { id: c.id, question_id: q.id, label: e.target.value, is_correct: c.is_correct } }); onRefresh(); }
                }} />
                <Button size="sm" variant="ghost" onClick={async () => { await delChoice({ data: { id: c.id } }); onRefresh(); }}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={async () => {
              await saveChoice({ data: { question_id: q.id, label: "Nouvelle réponse", is_correct: false } });
              onRefresh();
            }}><Plus className="h-4 w-4 mr-1" />Ajouter une réponse</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultsTab({ examId }: { examId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useServerFn(listAttempts);
  useEffect(() => { (async () => { try { setRows(await list({ data: { examId } })); } finally { setLoading(false); } })(); }, [examId]);
  if (loading) return <p className="p-4 text-sm text-muted-foreground">Chargement…</p>;
  if (rows.length === 0) return <p className="p-4 text-sm text-muted-foreground">Aucune tentative.</p>;
  return (
    <Card><CardContent className="p-0">
      <Table>
        <TableHeader><TableRow>
          <TableHead>Candidat</TableHead><TableHead>Licence</TableHead><TableHead>Cabinet</TableHead>
          <TableHead>Date</TableHead><TableHead>Bonnes</TableHead><TableHead>Mauvaises</TableHead>
          <TableHead>Score</TableHead><TableHead>Statut</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.candidate?.full_name || r.candidate_id.slice(0, 8)}</TableCell>
              <TableCell>{r.candidate?.license || "—"}</TableCell>
              <TableCell>{r.candidate?.firm || "—"}</TableCell>
              <TableCell>{new Date(r.started_at).toLocaleString("fr-FR")}</TableCell>
              <TableCell>{r.correct_count ?? "—"}</TableCell>
              <TableCell>{r.wrong_count ?? "—"}</TableCell>
              <TableCell>{r.score_pct != null ? Number(r.score_pct).toFixed(1) + "%" : "—"}</TableCell>
              <TableCell>
                <Badge variant={r.status === "admitted" ? "default" : r.passed ? "default" : r.passed === false ? "destructive" : "secondary"}>
                  {r.status === "admitted" ? "Admis" : r.status === "graded" ? (r.passed ? "Réussi" : "Échec") : r.status === "submitted" ? "À corriger" : "En cours"}
                </Badge>
              </TableCell>
              <TableCell>
                <Button size="sm" variant="outline" asChild>
                  <Link to={"/admin/examens/$id/copies/$attemptId" as any} params={{ id: examId, attemptId: r.id } as any}>Ouvrir</Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent></Card>
  );
}
