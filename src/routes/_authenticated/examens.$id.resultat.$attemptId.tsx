import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getMyResult } from "@/lib/bar-exam-taking.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/examens/$id/resultat/$attemptId")({
  head: () => ({ meta: [{ title: "Résultat de l'examen" }, { name: "robots", content: "noindex" }] }),
  component: ExamResult,
});

function ExamResult() {
  const { attemptId } = Route.useParams();
  const load = useServerFn(getMyResult);
  const [state, setState] = useState<any>(null);
  useEffect(() => { load({ data: { attemptId } }).then(setState); }, [attemptId]);
  if (!state) return <div className="p-6 text-sm text-muted-foreground">Chargement…</div>;
  const { attempt, exam } = state;
  const graded = attempt.status === "graded";
  const passed = attempt.passed === true;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-display text-2xl">{exam.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Terminé {attempt.submitted_at ? new Date(attempt.submitted_at).toLocaleString("fr-FR") : "—"}</p>
          </div>
          {graded ? (
            passed ? (
              <Badge className="bg-green-600 hover:bg-green-600 text-white text-base px-3 py-1"><Trophy className="h-4 w-4 mr-1" />Reçu</Badge>
            ) : (
              <Badge variant="destructive" className="text-base px-3 py-1"><XCircle className="h-4 w-4 mr-1" />Non admis</Badge>
            )
          ) : (
            <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />En cours de correction</Badge>
          )}
        </CardHeader>
        <CardContent>
          {graded ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Score" value={attempt.score_pct != null ? Number(attempt.score_pct).toFixed(1) + "%" : "—"} />
              <Stat label="Points" value={`${Number(attempt.score_points ?? 0).toFixed(1)} / ${Number(exam.total_points ?? 0).toFixed(0)}`} />
              <Stat label="Bonnes réponses" value={attempt.correct_count ?? "—"} />
              <Stat label="Seuil requis" value={`${exam.pass_threshold_pct}%`} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Votre copie contient des questions à correction manuelle. Le CEO examinera vos réponses et publiera votre résultat définitif prochainement.
            </p>
          )}
          {attempt.batonnier_comment && (
            <div className="mt-4 rounded border bg-secondary p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-1">Commentaire de la direction</p>
              <p className="text-sm whitespace-pre-wrap">{attempt.batonnier_comment}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {graded && passed && (
        <Card>
          <CardContent className="p-6 space-y-2">
            <p className="text-sm">Félicitations. Une fois votre admission au Barreau prononcée par la direction, vous recevrez votre licence officielle et pourrez télécharger votre carte professionnelle depuis « Mon espace ».</p>
            <Button asChild><Link to="/espace-avocat">Aller à Mon espace</Link></Button>
          </CardContent>
        </Card>
      )}

      <div>
        <Button variant="outline" asChild><Link to="/examens">← Retour aux examens</Link></Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold font-display">{value}</p>
    </div>
  );
}
