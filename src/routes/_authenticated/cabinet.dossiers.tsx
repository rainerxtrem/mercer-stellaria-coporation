import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFirmMatters } from "@/lib/firm-admin.functions";
import { PageHeader } from "@/components/site/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cabinet/dossiers")({
  head: () => ({ meta: [{ title: "Dossiers du cabinet" }] }),
  component: Page,
});

function Page() {
  const list = useServerFn(listFirmMatters);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setRows(await list()); } finally { setLoading(false); } })(); }, []);

  return (
    <div className="space-y-6 p-6">
      <PageHeader eyebrow="Espace Cabinet" title="Dossiers" description="Ensemble des dossiers ouverts par les membres du cabinet." />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Intitulé</TableHead>
              <TableHead className="hidden md:table-cell">Client</TableHead>
              <TableHead className="hidden md:table-cell">Avocat</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            : rows.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Aucun dossier.</TableCell></TableRow>
            : rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs">
                  <Link to="/dossiers/$matterId" params={{ matterId: m.id }} className="text-navy hover:underline">{m.number}</Link>
                </TableCell>
                <TableCell className="font-medium text-navy-deep">{m.title}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{m.clients ? `${m.clients.first_name} ${m.clients.last_name}` : "—"}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{m.owner_name ?? "—"}</TableCell>
                <TableCell><Badge variant={m.status === "closed" ? "secondary" : "default"}>{m.status}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
