import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listExams, upsertExam, setExamStatus, deleteExam } from "@/lib/bar-exams.functions";
import { AdminGuard } from "@/components/admin/AdminGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Play, Pause, Archive, Trash2, ScrollText } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/examens/")({
  head: () => ({ meta: [{ title: "Examens — CEO" }] }),
  component: () => (<AdminGuard><ExamsList /></AdminGuard>),
});

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", open: "Ouvert", closed: "Fermé", archived: "Archivé",
};

function ExamsList() {
  const [exams, setExams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const list = useServerFn(listExams);
  const create = useServerFn(upsertExam);
  const setStatus = useServerFn(setExamStatus);
  const del = useServerFn(deleteExam);
  const navigate = useNavigate();

  async function refresh() {
    try { setExams(await list()); } finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Examen du Barreau</h1>
          <p className="text-sm text-muted-foreground">Créez et pilotez les sessions d'examen officielles.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nouvel examen</Button>
          </DialogTrigger>
          <NewExamDialog onCreated={async (id) => { setOpen(false); await refresh(); navigate({ to: "/admin/examens/$id" as any, params: { id } as any }); }} onSubmit={create} />
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Sessions</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-sm text-muted-foreground">Chargement…</p> : exams.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun examen. Créez la première session.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Durée</TableHead>
                  <TableHead>Seuil</TableHead>
                  <TableHead>Points</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link to={"/admin/examens/$id" as any} params={{ id: e.id } as any} className="font-medium hover:underline">
                        {e.name}
                      </Link>
                      <p className="text-xs text-muted-foreground line-clamp-1">{e.description}</p>
                    </TableCell>
                    <TableCell><Badge variant={e.status === "open" ? "default" : "secondary"}>{STATUS_LABELS[e.status]}</Badge></TableCell>
                    <TableCell>{e.duration_min} min</TableCell>
                    <TableCell>{e.pass_threshold_pct}%</TableCell>
                    <TableCell>{Number(e.total_points).toFixed(0)} pts</TableCell>
                    <TableCell className="text-right space-x-1">
                      {e.status !== "open" && (
                        <Button size="sm" variant="ghost" onClick={async () => { await setStatus({ data: { id: e.id, status: "open" } }); toast.success("Examen publié"); refresh(); }}>
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                      {e.status === "open" && (
                        <Button size="sm" variant="ghost" onClick={async () => { await setStatus({ data: { id: e.id, status: "closed" } }); toast.success("Examen fermé"); refresh(); }}>
                          <Pause className="h-4 w-4" />
                        </Button>
                      )}
                      {e.status !== "archived" && (
                        <Button size="sm" variant="ghost" onClick={async () => { await setStatus({ data: { id: e.id, status: "archived" } }); toast.success("Archivé"); refresh(); }}>
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={"/admin/examens/$id" as any} params={{ id: e.id } as any}>
                          <ScrollText className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (!confirm("Supprimer définitivement cet examen ?")) return;
                        await del({ data: { id: e.id } }); toast.success("Supprimé"); refresh();
                      }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewExamDialog({ onCreated, onSubmit }: { onCreated: (id: string) => void; onSubmit: ReturnType<typeof useServerFn<typeof upsertExam>> }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(60);
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Nouvel examen</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Nom</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
        <div><Label>Durée (min)</Label><Input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></div>
      </div>
      <DialogFooter>
        <Button onClick={async () => {
          if (!name.trim()) return toast.error("Nom requis");
          try {
            const { id } = await onSubmit({ data: {
              name, description, duration_min: duration, pass_threshold_pct: 60,
              max_attempts: 1, show_results_to_candidate: true, auto_publish_results: false,
              shuffle_questions: false, shuffle_answers: false,
            } });
            onCreated(id);
          } catch (e: any) { toast.error(e?.message || "Erreur"); }
        }}>Créer</Button>
      </DialogFooter>
    </DialogContent>
  );
}
