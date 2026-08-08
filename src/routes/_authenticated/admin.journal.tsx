import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listAuditLog, exportAuditCsv, listAuditEntities } from "@/lib/audit.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/journal")({
  head: () => ({ meta: [{ title: "Journal d'audit — Administration" }] }),
  component: Page,
});

const ACTIONS = ["insert", "update", "delete"] as const;

function Page() {
  const list = useServerFn(listAuditLog);
  const csv = useServerFn(exportAuditCsv);
  const entities = useServerFn(listAuditEntities);

  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const pageSize = 50;

  const filters = { entity_type: entity || undefined, action: action || undefined, search: search || undefined, from: from || undefined, to: to || undefined };

  const { data: entList } = useQuery({ queryKey: ["audit-entities"], queryFn: () => entities() });
  const { data, isLoading } = useQuery({
    queryKey: ["audit", filters, page],
    queryFn: () => list({ data: { ...filters, page, page_size: pageSize } }),
  });

  const exportMut = useMutation({
    mutationFn: () => csv({ data: filters }),
    onSuccess: (res) => {
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `journal-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-navy-deep">Journal d'audit</h2>
          <p className="text-sm text-muted-foreground">Traçabilité complète des actions sur la plateforme.</p>
        </div>
        <Button onClick={() => exportMut.mutate()} disabled={exportMut.isPending} variant="outline">
          <Download className="mr-2 h-4 w-4" /> {exportMut.isPending ? "Export…" : "Exporter CSV"}
        </Button>
      </div>

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] md:grid-cols-6">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Recherche</label>
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Résumé…" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Entité</label>
          <Select value={entity || "all"} onValueChange={(v) => { setEntity(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {(entList ?? []).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Action</label>
          <Select value={action || "all"} onValueChange={(v) => { setAction(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger><SelectValue placeholder="Toutes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Du</label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Au</label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entité</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Résumé</TableHead>
              <TableHead>Acteur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            ) : (data?.rows ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Aucune action enregistrée.</TableCell></TableRow>
            ) : (data?.rows ?? []).map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString("fr-FR")}</TableCell>
                <TableCell className="text-xs">{r.entity_type}</TableCell>
                <TableCell>
                  <Badge variant={r.action === "delete" ? "destructive" : r.action === "insert" ? "default" : "secondary"}>{r.action}</Badge>
                </TableCell>
                <TableCell className="max-w-[420px] truncate text-sm">{r.summary ?? "—"}</TableCell>
                <TableCell className="font-mono text-[10px] text-muted-foreground">{r.actor_id?.slice(0, 8) ?? "système"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t border-border bg-secondary/40 px-4 py-2 text-xs">
          <span className="text-muted-foreground">{total} entrée(s) • page {page} / {pages}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
