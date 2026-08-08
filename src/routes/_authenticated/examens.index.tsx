import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listOpenExams } from "@/lib/bar-exams.functions";
import { startExam } from "@/lib/bar-exam-taking.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, GraduationCap, Trophy } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/examens/")({
  head: () => ({ meta: [{ title: "Examen du Barreau — Portail" }] }),
  component: ExamsCandidate,
});

function ExamsCandidate() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useServerFn(listOpenExams);
  useEffect(() => { list().then((x) => { setExams(x); setLoading(false); }); }, []);
  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div>
        <h1 className="font-display text-2xl font-bold">Examen officiel du Barreau</h1>
        <p className="text-sm text-muted-foreground">Sélectionnez une session ouverte. Un code d'accès vous sera demandé.</p>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : exams.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Aucune session ouverte pour le moment.</CardContent></Card>
      ) : exams.map((e) => (
        <Card key={e.id}>
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-lg flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" />{e.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {e.description && <p className="text-sm">{e.description}</p>}
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{e.duration_min} min</Badge>
              <Badge variant="outline"><Trophy className="h-3 w-3 mr-1" />Seuil {e.pass_threshold_pct}%</Badge>
              <Badge variant="outline">{Number(e.total_points).toFixed(0)} points</Badge>
              <Badge variant="outline">{e.max_attempts} tentative{e.max_attempts > 1 ? "s" : ""}</Badge>
            </div>
            <StartButton examId={e.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StartButton({ examId }: { examId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const start = useServerFn(startExam);
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button>Passer l'examen</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Code d'accès</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Saisissez le code communiqué par la direction</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono tracking-widest text-center text-lg" maxLength={16} />
          <p className="text-xs text-muted-foreground">Une fois l'examen démarré, le chronomètre ne peut pas être mis en pause. Assurez-vous d'avoir le temps nécessaire.</p>
        </div>
        <DialogFooter>
          <Button disabled={loading || !code.trim()} onClick={async () => {
            setLoading(true);
            try {
              const r = await start({ data: { examId, accessCode: code } });
              navigate({ to: "/examens/$id/passage" as any, params: { id: examId } as any, search: { attempt: r.attemptId } as any });
            } catch (e: any) { toast.error(e?.message || "Code invalide"); }
            finally { setLoading(false); }
          }}>Démarrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
