import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listTasks, updateTask } from "@/lib/assistant.functions";
import { CheckSquare, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/taches")({
  head: () => ({ meta: [
    { title: "Mes tâches — Mercer & Stellaria Corporation" },
    { name: "description", content: "Suivez les tâches de vos dossiers juridiques : à faire, en cours, terminées." },
  ] }),
  component: Page,
});

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const patchFn = useServerFn(updateTask);

  const mine = useQuery({ queryKey: ["tasks", "mine"], queryFn: () => listFn({ data: { mine: true } }) });
  const all = useQuery({ queryKey: ["tasks", "all"], queryFn: () => listFn({ data: {} }) });

  const patch = useMutation({
    mutationFn: (v: { id: string; status: "todo"|"doing"|"done" }) => patchFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  function renderList(rows: any[]) {
    if (rows.length === 0) return <div className="py-10 text-center text-sm text-muted-foreground">Aucune tâche.</div>;
    const grouped = { todo: [] as any[], doing: [] as any[], done: [] as any[] };
    rows.forEach((r) => grouped[r.status as keyof typeof grouped]?.push(r));
    const labels = { todo: "À faire", doing: "En cours", done: "Terminées" };
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(labels) as (keyof typeof labels)[]).map((k) => (
          <Card key={k} className="shadow-[var(--shadow-card)]">
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <span>{labels[k]}</span>
                <span>{grouped[k].length}</span>
              </div>
              <ul className="space-y-2">
                {grouped[k].map((t) => {
                  const overdue = t.due_date && t.status !== "done" && new Date(t.due_date) < new Date(new Date().toDateString());
                  return (
                    <li key={t.id} className="rounded-md border border-border p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className={`font-medium ${t.status === "done" ? "line-through text-muted-foreground" : "text-navy-deep"}`}>{t.title}</div>
                          {t.matters && (
                            <Link to="/dossiers/$matterId" params={{ matterId: t.matter_id }} className="mt-0.5 flex items-center gap-1 text-xs text-navy hover:underline">
                              {t.matters.number} · {t.matters.title} <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                        <Badge variant={t.priority === "high" ? "destructive" : t.priority === "medium" ? "default" : "secondary"}>
                          {t.priority === "high" ? "Haute" : t.priority === "medium" ? "Moyenne" : "Basse"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Select value={t.status} onValueChange={(v: any) => patch.mutate({ id: t.id, status: v })}>
                          <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="todo">À faire</SelectItem>
                            <SelectItem value="doing">En cours</SelectItem>
                            <SelectItem value="done">Terminée</SelectItem>
                          </SelectContent>
                        </Select>
                        {t.due_date && (
                          <span className={`text-xs ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                            {new Date(t.due_date).toLocaleDateString("fr-FR")}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
                {grouped[k].length === 0 && <li className="text-xs text-muted-foreground">—</li>}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Suivi"
        title="Mes tâches"
        description="Toutes les tâches de vos dossiers accessibles, avec priorité, échéance et statut."
      />
      <section className="container-page py-8">
        <Tabs defaultValue="mine">
          <TabsList>
            <TabsTrigger value="mine"><CheckSquare className="mr-1.5 h-4 w-4" />Assignées à moi</TabsTrigger>
            <TabsTrigger value="all">Tous les dossiers accessibles</TabsTrigger>
          </TabsList>
          <TabsContent value="mine" className="mt-4">{renderList(mine.data ?? [])}</TabsContent>
          <TabsContent value="all" className="mt-4">{renderList(all.data ?? [])}</TabsContent>
        </Tabs>
      </section>
    </>
  );
}
