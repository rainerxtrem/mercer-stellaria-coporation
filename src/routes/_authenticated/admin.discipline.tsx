import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listComplaints, updateComplaint, createCase, listCases } from "@/lib/disciplinary.functions";
import { listPublicLawyers } from "@/lib/public-registry.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, FolderPlus, Gavel } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/discipline")({
  head: () => ({ meta: [{ title: "Commission disciplinaire — Administration" }] }),
  component: Page,
});

const COMPLAINT_STATUS: Record<string, string> = {
  new: "Nouveau", under_review: "En instruction", dismissed: "Classé", referred: "Renvoyé",
};
const CASE_STATUS: Record<string, string> = {
  opened: "Ouvert", investigation: "Instruction", hearing: "Audience", decided: "Décidé", closed: "Clôturé",
};

function Page() {
  const complaintsFn = useServerFn(listComplaints);
  const casesFn = useServerFn(listCases);
  const { data: complaints, isLoading: lc } = useQuery({ queryKey: ["disc-complaints"], queryFn: () => complaintsFn() });
  const { data: cases, isLoading: lk } = useQuery({ queryKey: ["disc-cases"], queryFn: () => casesFn() });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-navy-deep">Commission disciplinaire</h2>
        <p className="text-sm text-muted-foreground">Signalements citoyens, dossiers instruits et décisions rendues.</p>
      </div>
      <Tabs defaultValue="complaints">
        <TabsList>
          <TabsTrigger value="complaints">Signalements ({complaints?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="cases">Dossiers disciplinaires ({cases?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="complaints" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
            <Table>
              <TableHeader className="bg-secondary">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plaignant</TableHead>
                  <TableHead>Avocat visé</TableHead>
                  <TableHead>Objet</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lc ? <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                : (complaints ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Aucun signalement.</TableCell></TableRow>
                : (complaints as any[]).map((c) => <ComplaintRow key={c.id} c={c} />)}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="cases" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
            <Table>
              <TableHeader className="bg-secondary">
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead>Avocat</TableHead>
                  <TableHead>Objet</TableHead>
                  <TableHead>Ouvert le</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lk ? <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
                : (cases ?? []).length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Aucun dossier.</TableCell></TableRow>
                : (cases as any[]).map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-mono text-xs">{k.number}</TableCell>
                    <TableCell className="text-sm">Me {k.lawyer?.first_name} {k.lawyer?.last_name}</TableCell>
                    <TableCell className="text-sm">{k.title}</TableCell>
                    <TableCell className="text-xs">{new Date(k.opened_at).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell><Badge variant="secondary">{CASE_STATUS[k.status] ?? k.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline"><Link to="/admin/discipline/$caseId" params={{ caseId: k.id }}><Gavel className="mr-1.5 h-3.5 w-3.5" />Ouvrir</Link></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComplaintRow({ c }: { c: any }) {
  const qc = useQueryClient();
  const update = useServerFn(updateComplaint);
  const create = useServerFn(createCase);
  const lawyersFn = useServerFn(listPublicLawyers);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(c.subject);
  const [lawyerId, setLawyerId] = useState<string>(c.lawyer_id ?? "");
  const [summary, setSummary] = useState(c.description?.slice(0, 400) ?? "");
  const { data: lawyers } = useQuery({ queryKey: ["public-lawyers-select"], queryFn: () => lawyersFn() });

  const updMut = useMutation({
    mutationFn: (patch: any) => update({ data: { id: c.id, ...patch } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["disc-complaints"] }),
  });

  const openMut = useMutation({
    mutationFn: () => create({ data: { lawyer_id: lawyerId, title, summary, complaint_id: c.id } }),
    onSuccess: () => {
      toast.success("Dossier ouvert");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["disc-complaints"] });
      qc.invalidateQueries({ queryKey: ["disc-cases"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Impossible d'ouvrir le dossier"),
  });

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs">{new Date(c.created_at).toLocaleDateString("fr-FR")}</TableCell>
      <TableCell className="text-sm">{c.complainant_name}<div className="text-xs text-muted-foreground">{c.complainant_email}</div></TableCell>
      <TableCell className="text-sm">{c.lawyer_id ? "Registre" : (c.lawyer_name_input || "—")}</TableCell>
      <TableCell className="max-w-[280px] truncate text-sm" title={c.description}>{c.subject}</TableCell>
      <TableCell>
        <select value={c.status} onChange={(e) => updMut.mutate({ status: e.target.value })} className="rounded-md border border-input bg-background px-2 py-1 text-xs">
          {Object.entries(COMPLAINT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </TableCell>
      <TableCell className="text-right">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline"><FolderPlus className="mr-1.5 h-3.5 w-3.5" />Ouvrir un dossier</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Ouverture d'un dossier disciplinaire</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Avocat visé *</Label>
                <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={lawyerId} onChange={(e) => setLawyerId(e.target.value)}>
                  <option value="">— Sélectionner —</option>
                  {(lawyers ?? []).map((l: any) => <option key={l.id} value={l.id}>Me {l.first_name} {l.last_name} — {l.license}</option>)}
                </select>
              </div>
              <div><Label>Intitulé *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div><Label>Résumé</Label><Textarea rows={4} value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annuler</Button>
              <Button className="bg-navy" disabled={!lawyerId || !title || openMut.isPending} onClick={() => openMut.mutate()}>
                {openMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ouvrir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}
