import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMyAttempt, saveAnswer, submitAttempt } from "@/lib/bar-exam-taking.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, ChevronLeft, ChevronRight, Save } from "lucide-react";
import { toast } from "sonner";

type Search = { attempt?: string };

export const Route = createFileRoute("/_authenticated/examens/$id/passage")({
  validateSearch: (s: Record<string, unknown>): Search => ({ attempt: typeof s.attempt === "string" ? s.attempt : undefined }),
  head: () => ({ meta: [{ title: "Passage de l'examen" }, { name: "robots", content: "noindex" }] }),
  component: TakeExam,
});

function TakeExam() {
  const { attempt: attemptId } = Route.useSearch();
  const { id: examId } = Route.useParams();
  const load = useServerFn(getMyAttempt);
  const save = useServerFn(saveAnswer);
  const submit = useServerFn(submitAttempt);
  const navigate = useNavigate();
  const [state, setState] = useState<any>(null);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, { choice_ids: string[]; text_answer: string }>>({});
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!attemptId) { navigate({ to: "/examens" as any }); return; }
    (async () => {
      const s = await load({ data: { attemptId } });
      setState(s);
      const map: Record<string, any> = {};
      (s.answers as any[]).forEach((a) => { map[a.question_id] = { choice_ids: a.choice_ids ?? [], text_answer: a.text_answer ?? "" }; });
      setAnswers(map);
    })().catch((e) => toast.error(e?.message || "Impossible de charger l'examen"));
  }, [attemptId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const deadline = state?.attempt?.deadline_at ? new Date(state.attempt.deadline_at).getTime() : 0;
  const remaining = Math.max(0, Math.floor((deadline - now) / 1000));
  const duration = (state?.exam?.duration_min ?? 60) * 60;
  const pct = duration > 0 ? Math.max(0, Math.min(100, (remaining / duration) * 100)) : 0;

  useEffect(() => {
    if (!state || submittedRef.current) return;
    if (remaining <= 0 && deadline > 0) {
      submittedRef.current = true;
      submit({ data: { attemptId: attemptId!, auto: true } }).then((r: any) => {
        toast.info("Temps écoulé — examen validé automatiquement");
        navigate({ to: "/examens/$id/resultat/$attemptId" as any, params: { id: examId, attemptId: attemptId! } as any });
      }).catch((e) => toast.error(e?.message || "Erreur"));
    }
  }, [remaining, state]);

  const question = state?.questions?.[idx];
  const qChoices = useMemo(() => (state?.choices ?? []).filter((c: any) => c.question_id === question?.id), [question, state]);
  const answer = question ? (answers[question.id] ?? { choice_ids: [], text_answer: "" }) : { choice_ids: [], text_answer: "" };

  const persist = async (qid: string, patch: Partial<{ choice_ids: string[]; text_answer: string }>) => {
    const next = { ...(answers[qid] ?? { choice_ids: [], text_answer: "" }), ...patch };
    setAnswers((prev) => ({ ...prev, [qid]: next }));
    setSaving(qid);
    try {
      await save({ data: { attemptId: attemptId!, questionId: qid, choiceIds: next.choice_ids, textAnswer: next.text_answer || null } });
    } catch (e: any) { toast.error(e?.message || "Sauvegarde échouée"); }
    finally { setSaving(null); }
  };

  if (!state) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const total = state.questions.length;
  const answered = Object.keys(answers).filter((k) => answers[k].choice_ids.length > 0 || (answers[k].text_answer ?? "").trim().length > 0).length;

  const doSubmit = async () => {
    if (!confirm("Valider définitivement votre examen ?")) return;
    submittedRef.current = true;
    try {
      await submit({ data: { attemptId: attemptId!, auto: false } });
      toast.success("Examen validé");
      navigate({ to: "/examens/$id/resultat/$attemptId" as any, params: { id: examId, attemptId: attemptId! } as any });
    } catch (e: any) { toast.error(e?.message || "Erreur"); }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto p-3 flex items-center gap-3">
          <div>
            <h1 className="font-display text-base font-bold">{state.exam.name}</h1>
            <p className="text-xs text-muted-foreground">Question {idx + 1} / {total} • {answered} répondues</p>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="font-mono text-lg font-bold" data-testid="timer">{mm}:{ss}</span>
          </div>
          <Button size="sm" onClick={doSubmit}>Valider l'examen</Button>
        </div>
        <Progress value={pct} className="h-1 rounded-none" />
      </div>

      <div className="max-w-5xl mx-auto p-6 grid grid-cols-1 md:grid-cols-[1fr_180px] gap-6">
        <div className="space-y-4">
          {question && (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Question {idx + 1} / {total} • {Number(question.points)} pt</p>
                    <h2 className="font-display text-lg font-semibold mt-1">{question.prompt}</h2>
                    {question.category && <Badge variant="outline" className="mt-2">{question.category}</Badge>}
                  </div>
                  {saving === question.id && <span className="text-xs text-muted-foreground flex items-center gap-1"><Save className="h-3 w-3 animate-pulse" />Sauvegarde…</span>}
                </div>

                {(question.type === "single" || question.type === "truefalse") && (
                  <div className="space-y-2">
                    {qChoices.map((c: any) => (
                      <label key={c.id} className={`flex items-center gap-3 p-3 rounded border cursor-pointer hover:bg-secondary ${answer.choice_ids.includes(c.id) ? "border-primary bg-primary/5" : ""}`}>
                        <input type="radio" checked={answer.choice_ids.includes(c.id)} onChange={() => persist(question.id, { choice_ids: [c.id] })} />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {question.type === "multiple" && (
                  <div className="space-y-2">
                    {qChoices.map((c: any) => (
                      <label key={c.id} className={`flex items-center gap-3 p-3 rounded border cursor-pointer hover:bg-secondary ${answer.choice_ids.includes(c.id) ? "border-primary bg-primary/5" : ""}`}>
                        <input type="checkbox" checked={answer.choice_ids.includes(c.id)} onChange={(e) => {
                          const set = new Set(answer.choice_ids);
                          if (e.target.checked) set.add(c.id); else set.delete(c.id);
                          persist(question.id, { choice_ids: [...set] });
                        }} />
                        <span>{c.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {question.type === "short" && (
                  <Input value={answer.text_answer} onChange={(e) => setAnswers((p) => ({ ...p, [question.id]: { ...answer, text_answer: e.target.value } }))}
                    onBlur={(e) => persist(question.id, { text_answer: e.target.value })} placeholder="Votre réponse…" />
                )}

                {question.type === "essay" && (
                  <Textarea rows={10} value={answer.text_answer}
                    onChange={(e) => setAnswers((p) => ({ ...p, [question.id]: { ...answer, text_answer: e.target.value } }))}
                    onBlur={(e) => persist(question.id, { text_answer: e.target.value })} placeholder="Rédigez votre réponse…" />
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-between">
            <Button variant="outline" disabled={idx === 0} onClick={() => setIdx(idx - 1)}><ChevronLeft className="h-4 w-4 mr-1" />Précédent</Button>
            <Button variant="outline" disabled={idx >= total - 1} onClick={() => setIdx(idx + 1)}>Suivant<ChevronRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </div>

        <div>
          <Card>
            <CardContent className="p-3">
              <p className="text-xs font-semibold mb-2">Palette</p>
              <div className="grid grid-cols-5 gap-1">
                {state.questions.map((q: any, i: number) => {
                  const has = (answers[q.id]?.choice_ids?.length ?? 0) > 0 || (answers[q.id]?.text_answer ?? "").length > 0;
                  return (
                    <button key={q.id} onClick={() => setIdx(i)}
                      className={`h-8 w-8 text-xs rounded border ${i === idx ? "ring-2 ring-primary" : ""} ${has ? "bg-primary/10 border-primary" : "bg-secondary"}`}>{i + 1}</button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
