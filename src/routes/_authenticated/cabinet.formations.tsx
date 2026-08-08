import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFirmTrainings } from "@/lib/firm-admin.functions";
import { PageHeader } from "@/components/site/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cabinet/formations")({
  head: () => ({ meta: [{ title: "Formations du cabinet" }] }),
  component: Page,
});

function Page() {
  const list = useServerFn(listFirmTrainings);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setRows(await list()); } finally { setLoading(false); } })(); }, []);

  return (
    <div className="space-y-6 p-6">
      <PageHeader eyebrow="Espace Cabinet" title="Formations" description="Suivi des formations continues suivies par les membres." />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>Membre</TableHead>
              <TableHead>Formation</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="hidden md:table-cell">Complétée le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            : rows.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Aucune formation suivie.</TableCell></TableRow>
            : rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.user_name ?? "—"}</TableCell>
                <TableCell>{t.trainings?.title ?? "—"}</TableCell>
                <TableCell><Badge variant={t.status === "passed" ? "default" : "secondary"}>{t.status}</Badge></TableCell>
                <TableCell className="text-right">{t.score ?? "—"}</TableCell>
                <TableCell className="text-right">{t.status === "passed" ? (t.trainings?.points ?? 0) : 0}</TableCell>
                <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{t.completed_at ? new Date(t.completed_at).toLocaleDateString("fr-FR") : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
