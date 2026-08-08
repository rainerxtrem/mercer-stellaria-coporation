import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, GraduationCap, CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getTraining, submitTrainingAttempt } from "@/lib/trainings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/formations/$slug")({
  head: () => ({ meta: [{ title: "Formation — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

type Data = Awaited<ReturnType<typeof getTraining>>;

function Page() {
  const { slug } = useParams({ from: "/_authenticated/formations/$slug" });
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, Set<string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; max: number; pct: number; passed: boolean } | null>(null);
  const load = useServerFn(getTraining);
  const submit = useServerFn(submitTrainingAttempt);

  useEffect(() => { (async () => {
    const r = await load({ data: { slug } });
    setData(r); setLoading(false);
  })(); }, [slug]);

  const questions = data?.questions ?? [];
  const choices = data?.choices ?? [];
  const modules = data?.modules ?? [];
  const training = data?.training;

  const toggle = (qid: string, cid: string, multi: boolean) => {
    setAnswers((prev) => {
      const set = new Set(prev[qid] ?? []);
      if (multi) { set.has(cid) ? set.delete(cid) : set.add(cid); }
      else { set.clear(); set.add(cid); }
      return { ...prev, [qid]: set };
    });
  };

  const ready = useMemo(() => questions.every((q) => (answers[q.id]?.size ?? 0) > 0), [questions, answers]);

  async function handleSubmit() {
    if (!training) return;
    setSubmitting(true);
    try {
      const res = await submit({ data: {
        training_id: training.id,
        answers: questions.map((q) => ({ question_id: q.id, choice_ids: Array.from(answers[q.id] ?? []) })),
      }});
      setResult(res);
      if (res.passed) toast.success(`Formation validée : ${res.pct}%`);
      else toast.error(`Score insuffisant : ${res.pct}%`);
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSubmitting(false); }
  }

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-navy" /></div>;
  if (!training) return (
    <div className="container-page py-16 text-center">
      <p className="text-muted-foreground">Formation introuvable.</p>
      <Button asChild className="mt-4"><Link to="/formations">Retour au catalogue</Link></Button>
    </div>
  );

  return (
    <>
      <PageHeader eyebrow="Formation continue" title={training.title} description={training.description ?? undefined} />
      <section className="container-page grid gap-6 py-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {modules.map((m, i) => (
            <Card key={m.id}>
              <CardContent className="p-6">
                <div className="text-xs uppercase tracking-wider text-gold">Module {i + 1}</div>
                <h3 className="mt-1 font-display text-xl font-bold text-navy-deep">{m.title}</h3>
                {m.video_url && (
                  <div className="mt-4 aspect-video">
                    <iframe src={m.video_url} className="h-full w-full rounded-md border border-border" allowFullScreen />
                  </div>
                )}
                {m.content && <div className="mt-4 whitespace-pre-wrap text-sm">{m.content}</div>}
              </CardContent>
            </Card>
          ))}

          {questions.length > 0 && !result && (
            <Card className="border-2 border-gold/40">
              <CardContent className="p-6">
                <h3 className="font-display text-xl font-bold text-navy-deep">Quiz d'évaluation</h3>
                <p className="text-sm text-muted-foreground">Seuil de réussite : {training.pass_threshold}%</p>
                <div className="mt-6 space-y-6">
                  {questions.map((q, i) => {
                    const qChoices = choices.filter((c) => c.question_id === q.id);
                    const multi = q.kind === "multi";
                    return (
                      <div key={q.id} className="space-y-3">
                        <div className="font-medium text-navy-deep">{i + 1}. {q.prompt}</div>
                        <div className="space-y-2">
                          {qChoices.map((c) => {
                            const checked = answers[q.id]?.has(c.id) ?? false;
                            return (
                              <label key={c.id} className={`flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm transition ${checked ? "border-gold bg-gold/5" : "border-border hover:bg-muted"}`}>
                                <Checkbox checked={checked} onCheckedChange={() => toggle(q.id, c.id, multi)} />
                                <span>{c.label}</span>
                              </label>
                            );
                          })}
                        </div>
                        {multi && <div className="text-xs text-muted-foreground">Plusieurs réponses possibles.</div>}
                      </div>
                    );
                  })}
                </div>
                <Button onClick={handleSubmit} disabled={!ready || submitting} className="mt-6 bg-navy hover:bg-navy-deep">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Soumettre le quiz"}
                </Button>
              </CardContent>
            </Card>
          )}

          {result && (
            <Card className={`border-2 ${result.passed ? "border-emerald-300" : "border-red-300"}`}>
              <CardContent className="p-6 text-center">
                {result.passed
                  ? <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
                  : <XCircle className="mx-auto h-14 w-14 text-red-600" />}
                <div className="mt-3 font-display text-2xl font-bold text-navy-deep">
                  {result.passed ? "Formation validée" : "Score insuffisant"}
                </div>
                <div className="text-3xl font-bold text-gold">{result.pct}%</div>
                <div className="text-sm text-muted-foreground">{result.score} / {result.max} points</div>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="outline" asChild><Link to="/formations"><ArrowLeft className="mr-2 h-4 w-4" />Catalogue</Link></Button>
                  {!result.passed && <Button onClick={() => { setResult(null); setAnswers({}); }} className="bg-navy">Réessayer</Button>}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card><CardContent className="p-5">
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-gold"><GraduationCap className="h-5 w-5" /></div>
            <div className="text-sm"><span className="text-muted-foreground">Durée :</span> {training.duration_min} min</div>
            <div className="text-sm"><span className="text-muted-foreground">Modules :</span> {modules.length}</div>
            <div className="text-sm"><span className="text-muted-foreground">Questions :</span> {questions.length}</div>
          </CardContent></Card>
        </aside>
      </section>
    </>
  );
}
