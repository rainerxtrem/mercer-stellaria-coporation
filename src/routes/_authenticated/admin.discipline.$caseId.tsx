import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getCase, updateCase, addHearing, updateHearing, addDecision, togglePublishDecision } from "@/lib/disciplinary.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, Calendar, Gavel, Check } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/discipline/$caseId")({
  head: () => ({ meta: [{ title: "Dossier disciplinaire — Administration" }] }),
  component: Page,
});

const DECISION_LABEL: Record<string, string> = { dismissal: "Classement", warning: "Avertissement", reprimand: "Blâme", suspension: "Suspension", disbarment: "Radiation" };
const STATUS: Record<string, string> = { opened: "Ouvert", investigation: "Instruction", hearing: "Audience", decided: "Décidé", closed: "Clôturé" };

function Page() {
  const { caseId } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getCase);
  const upd = useServerFn(updateCase);
  const addH = useServerFn(addHearing);
  const updH = useServerFn(updateHearing);
  const addD = useServerFn(addDecision);
  const tog = useServerFn(togglePublishDecision);

  const { data, isLoading } = useQuery({
    queryKey: ["disc-case", caseId],
    queryFn: () => getFn({ data: { id: caseId } }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["disc-case", caseId] });

  const statusMut = useMutation({ mutationFn: (s: any) => upd({ data: { id: caseId, status: s } }), onSuccess: invalidate });

  // Hearing form
  const [hSched, setHSched] = useState("");
  const [hLoc, setHLoc] = useState("");
  const [hNotes, setHNotes] = useState("");
  const hearMut = useMutation({
    mutationFn: () => addH({ data: { case_id: caseId, scheduled_at: new Date(hSched).toISOString(), location: hLoc || undefined, notes: hNotes || undefined } }),
    onSuccess: () => { toast.success("Audience planifiée"); setHSched(""); setHLoc(""); setHNotes(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  // Decision form
  const [dKind, setDKind] = useState<any>("warning");
  const [dMot, setDMot] = useState("");
  const [dStart, setDStart] = useState("");
  const [dEnd, setDEnd] = useState("");
  const [dPub, setDPub] = useState(true);
  const decMut = useMutation({
    mutationFn: () => addD({ data: { case_id: caseId, decision: dKind, motivation: dMot, sanction_start: dStart || undefined, sanction_end: dEnd || undefined, published: dPub } }),
    onSuccess: () => { toast.success("Décision enregistrée"); setDMot(""); setDStart(""); setDEnd(""); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading || !data) return <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin" /></div>;
  const k = data.case;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2"><Link to="/admin/discipline"><ArrowLeft className="mr-1.5 h-4 w-4" />Retour</Link></Button>
          <h2 className="font-display text-2xl font-bold text-navy-deep">{k.number} — {k.title}</h2>
          <p className="text-sm text-muted-foreground">Avocat concerné : <strong>Me {k.lawyer?.first_name} {k.lawyer?.last_name}</strong> — {k.lawyer?.license}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={k.status} onChange={(e) => statusMut.mutate(e.target.value)} className="rounded-md border border-input bg-background px-3 py-2 text-sm">
            {Object.entries(STATUS).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}
          </select>
        </div>
      </div>

      {k.summary && <div className="rounded-xl border border-border bg-card p-5 text-sm shadow-[var(--shadow-card)]"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Résumé</div>{k.summary}</div>}

      <Tabs defaultValue="hearings">
        <TabsList>
          <TabsTrigger value="hearings">Audiences ({data.hearings.length})</TabsTrigger>
          <TabsTrigger value="decisions">Décisions ({data.decisions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="hearings" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-navy-deep"><Calendar className="h-4 w-4" />Planifier une audience</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label>Date & heure *</Label><Input type="datetime-local" value={hSched} onChange={(e) => setHSched(e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Lieu</Label><Input value={hLoc} onChange={(e) => setHLoc(e.target.value)} placeholder="Salle du Conseil, 12 rue du Palais…" /></div>
              <div className="md:col-span-3"><Label>Notes</Label><Textarea rows={2} value={hNotes} onChange={(e) => setHNotes(e.target.value)} /></div>
            </div>
            <div className="mt-3 flex justify-end"><Button disabled={!hSched || hearMut.isPending} onClick={() => hearMut.mutate()} className="bg-navy">{hearMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Planifier</Button></div>
          </div>
          {data.hearings.map((h: any) => (
            <div key={h.id} className="flex items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <div>
                <div className="text-sm font-medium">{new Date(h.scheduled_at).toLocaleString("fr-FR")}</div>
                <div className="text-xs text-muted-foreground">{h.location || "Lieu non précisé"}</div>
                {h.notes && <div className="mt-2 whitespace-pre-line text-sm">{h.notes}</div>}
              </div>
              <Button size="sm" variant={h.held ? "secondary" : "outline"} onClick={() => updH({ data: { id: h.id, held: !h.held } }).then(invalidate)}>
                {h.held ? <><Check className="mr-1.5 h-3.5 w-3.5" />Tenue</> : "Marquer tenue"}
              </Button>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="decisions" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-navy-deep"><Gavel className="h-4 w-4" />Prononcer une décision</div>
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label>Type *</Label>
                <select value={dKind} onChange={(e) => setDKind(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {Object.entries(DECISION_LABEL).map(([kk, v]) => <option key={kk} value={kk}>{v}</option>)}
                </select>
              </div>
              {(dKind === "suspension") && (<>
                <div><Label>Début sanction</Label><Input type="date" value={dStart} onChange={(e) => setDStart(e.target.value)} /></div>
                <div><Label>Fin sanction</Label><Input type="date" value={dEnd} onChange={(e) => setDEnd(e.target.value)} /></div>
              </>)}
              <div className="md:col-span-3"><Label>Motivation *</Label><Textarea rows={5} value={dMot} onChange={(e) => setDMot(e.target.value)} placeholder="Exposé des faits, moyens et motifs de la décision." /></div>
              <label className="col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={dPub} onChange={(e) => setDPub(e.target.checked)} />Publier (anonymisée)</label>
            </div>
            <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">Suspension ou radiation appliquent automatiquement le statut sur l'avocat.</div>
            <div className="mt-3 flex justify-end"><Button disabled={!dMot || decMut.isPending} onClick={() => decMut.mutate()} className="bg-navy">{decMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer</Button></div>
          </div>
          {data.decisions.map((d: any) => (
            <div key={d.id} className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge>{DECISION_LABEL[d.decision]}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(d.decided_at).toLocaleDateString("fr-FR")}</span>
                  {d.sanction_start && <span className="text-xs text-muted-foreground">du {new Date(d.sanction_start).toLocaleDateString("fr-FR")} au {d.sanction_end ? new Date(d.sanction_end).toLocaleDateString("fr-FR") : "…"}</span>}
                </div>
                <Button size="sm" variant={d.published ? "secondary" : "outline"} onClick={() => tog({ data: { id: d.id, published: !d.published } }).then(invalidate)}>
                  {d.published ? "Publiée" : "Dépublier"}
                </Button>
              </div>
              <p className="mt-3 whitespace-pre-line text-sm">{d.motivation}</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
