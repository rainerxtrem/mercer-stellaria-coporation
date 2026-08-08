import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getAttemptForGrading, gradeManualAnswer, finalizeGrading, admitToBar } from "@/lib/bar-exams.functions";
import { listPublicFirms } from "@/lib/public-registry.functions";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/examens/$id/copies/$attemptId")({
  head: () => ({ meta: [{ title: "Copie candidat — CEO" }] }),
  component: () => (<AdminGuard><GradeAttempt /></AdminGuard>),
});

function GradeAttempt() {
  const { id, attemptId } = Route.useParams();
  const load = useServerFn(getAttemptForGrading);
  const gradeManual = useServerFn(gradeManualAnswer);
  const finalize = useServerFn(finalizeGrading);
  const [state, setState] = useState<any>(null);
  const [comment, setComment] = useState("");
  const refresh = async () => { const s = await load({ data: { attemptId } }); setState(s); setComment(s.attempt.batonnier_comment || ""); };
  useEffect(() => { refresh(); }, [attemptId]);
  if (!state) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  const { attempt, exam, questions, choices, answers, candidate } = state;
  const answerMap = new Map(answers.map((a: any) => [a.question_id, a]));

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="font-display text-2xl font-bold">Copie de {candidate?.full_name || "candidat"}</h1>
          <p className="text-xs text-muted-foreground">Licence {candidate?.license || "—"} • Cabinet {candidate?.firm || "—"}</p>
          <p className="text-xs text-muted-foreground">Démarrée {new Date(attempt.started_at).toLocaleString("fr-FR")} • {attempt.auto_submitted ? "Validation auto" : "Validée par le candidat"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to={"/admin/examens/$id" as any} params={{ id } as any}>← Retour</Link></Button>
          {attempt.status === "graded" && attempt.passed && (
            <AdmissionDialog attempt={attempt} candidate={candidate} onDone={refresh} />
          )}
        </div>
      </div>

      <Card><CardContent className="p-4 grid grid-cols-4 gap-4">
        <Stat label="Score" value={attempt.score_pct != null ? Number(attempt.score_pct).toFixed(1) + "%" : "—"} />
        <Stat label="Points" value={`${Number(attempt.score_points ?? 0).toFixed(1)} / ${Number(exam?.total_points ?? 0).toFixed(0)}`} />
        <Stat label="Bonnes" value={attempt.correct_count ?? "—"} />
        <Stat label="Mauvaises" value={attempt.wrong_count ?? "—"} />
      </CardContent></Card>

      <div className="space-y-3">
        {questions.map((q: any, idx: number) => {
          const a: any = answerMap.get(q.id) as any;
          const qChoices = choices.filter((c: any) => c.question_id === q.id);
          const isOpen = q.type === "short" || q.type === "essay";
          return (
            <Card key={q.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Q{idx + 1}. {q.prompt}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{q.points} pt</Badge>
                  {a?.is_correct === true && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  {a?.is_correct === false && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                {!isOpen && (
                  <ul className="space-y-1">
                    {qChoices.map((c: any) => {
                      const picked = (a?.choice_ids ?? []).includes(c.id);
                      return (
                        <li key={c.id} className={`flex items-center gap-2 p-1 rounded ${c.is_correct ? "bg-green-50 dark:bg-green-950/20" : ""} ${picked && !c.is_correct ? "bg-red-50 dark:bg-red-950/20" : ""}`}>
                          <span className={`inline-block h-3 w-3 rounded-full border ${picked ? "bg-primary" : ""}`} />
                          <span>{c.label}</span>
                          {c.is_correct && <Badge variant="outline" className="ml-auto">Bonne</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {isOpen && (
                  <>
                    <div className="rounded border bg-secondary p-3 whitespace-pre-wrap text-sm">{a?.text_answer || "— Aucune réponse —"}</div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Points attribués</Label>
                      <Input type="number" defaultValue={a?.awarded_points ?? 0} className="w-24"
                        onBlur={async (e) => {
                          if (!a?.id) return;
                          const pts = Number(e.target.value);
                          await gradeManual({ data: { answerId: a.id, points: pts, correct: pts > 0 } });
                          toast.success("Note enregistrée"); refresh();
                        }} />
                      <span className="text-xs text-muted-foreground">/ {q.points}</span>
                    </div>
                  </>
                )}
                {q.explanation && <p className="text-xs text-muted-foreground italic">{q.explanation}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <Label>Commentaire de la direction</Label>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          <Button onClick={async () => {
            try {
              const r = await finalize({ data: { attemptId, comment } });
              toast.success(r.passed ? "Copie validée — candidat reçu" : "Copie validée");
              refresh();
            } catch (e: any) { toast.error(e?.message || "Erreur"); }
          }}>Valider définitivement la copie</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>;
}

function AdmissionDialog({ attempt, candidate, onDone }: { attempt: any; candidate: any; onDone: () => void }) {
  const _navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [firms, setFirms] = useState<any[]>([]);
  const [form, setForm] = useState({
    first_name: (candidate?.full_name || "").split(" ")[0] || "",
    last_name: (candidate?.full_name || "").split(" ").slice(1).join(" ") || "",
    firm_id: candidate?.firm_id ?? null,
    specialty: "",
    city: "",
    email: "",
    phone: "",
  });
  const listFirmsFn = useServerFn(listPublicFirms);
  const admit = useServerFn(admitToBar);
  useEffect(() => { if (open) listFirmsFn().then(setFirms); }, [open]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Admettre au Barreau</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Admission au Barreau</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Prénom</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
            <div><Label>Nom</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
          </div>
          <div>
            <Label>Cabinet</Label>
            <Select value={form.firm_id ?? "none"} onValueChange={(v) => setForm({ ...form, firm_id: v === "none" ? null : v })}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Aucun —</SelectItem>
                {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Spécialité</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
            <div><Label>Ville</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Email pro</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Une licence sera générée automatiquement (SA-BAR-YYYY-NNNN) et le rôle Avocat sera accordé. La carte professionnelle est disponible dans « Mon espace » du nouvel avocat.</p>
        </div>
        <DialogFooter>
          <Button onClick={async () => {
            try {
              const r = await admit({ data: {
                attemptId: attempt.id, firm_id: form.firm_id,
                first_name: form.first_name, last_name: form.last_name,
                specialty: form.specialty || null, city: form.city || null,
                email: form.email || null, phone: form.phone || null,
              } });
              toast.success(`Admis au Barreau — licence ${r.license}`);
              setOpen(false); onDone();
            } catch (e: any) { toast.error(e?.message || "Erreur"); }
          }}>Confirmer l'admission</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
