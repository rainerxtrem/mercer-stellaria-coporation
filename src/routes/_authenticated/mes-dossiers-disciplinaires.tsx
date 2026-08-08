import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { myDisciplinaryCases } from "@/lib/disciplinary.functions";
import { Badge } from "@/components/ui/badge";
import { Loader2, Scale } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mes-dossiers-disciplinaires")({
  head: () => ({ meta: [{ title: "Mes dossiers disciplinaires" }] }),
  component: Page,
});

const DECISION_LABEL: Record<string, string> = { dismissal: "Classement", warning: "Avertissement", reprimand: "Blâme", suspension: "Suspension", disbarment: "Radiation" };
const STATUS: Record<string, string> = { opened: "Ouvert", investigation: "Instruction", hearing: "Audience", decided: "Décidé", closed: "Clôturé" };

function Page() {
  const fn = useServerFn(myDisciplinaryCases);
  const { data, isLoading } = useQuery({ queryKey: ["my-disc-cases"], queryFn: () => fn() });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Scale className="h-6 w-6 text-navy" />
        <h2 className="font-display text-xl font-bold text-navy-deep">Mes dossiers disciplinaires</h2>
      </div>
      {isLoading ? (
        <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>
      ) : (data ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">Aucun dossier disciplinaire à votre encontre.</div>
      ) : (data as any[]).map((k) => (
        <article key={k.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-mono text-sm">{k.number}</div>
            <Badge variant="secondary">{STATUS[k.status] ?? k.status}</Badge>
          </div>
          <h3 className="mt-1 font-display text-lg font-bold text-navy-deep">{k.title}</h3>
          {k.summary && <p className="mt-1 text-sm text-muted-foreground">{k.summary}</p>}

          {k.hearings?.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audiences</div>
              <ul className="space-y-1 text-sm">
                {k.hearings.map((h: any) => (
                  <li key={h.id}>• {new Date(h.scheduled_at).toLocaleString("fr-FR")}{h.location ? ` — ${h.location}` : ""}{h.held ? " (tenue)" : ""}</li>
                ))}
              </ul>
            </div>
          )}

          {k.decisions?.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Décisions</div>
              {k.decisions.map((d: any) => (
                <div key={d.id} className="mt-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
                  <div className="flex items-center gap-2"><Badge>{DECISION_LABEL[d.decision]}</Badge><span className="text-xs text-muted-foreground">{new Date(d.decided_at).toLocaleDateString("fr-FR")}</span></div>
                  <p className="mt-2 whitespace-pre-line">{d.motivation}</p>
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
