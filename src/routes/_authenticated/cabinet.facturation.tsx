import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFirmInvoices } from "@/lib/firm-admin.functions";
import { PageHeader } from "@/components/site/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cabinet/facturation")({
  head: () => ({ meta: [{ title: "Facturation du cabinet" }] }),
  component: Page,
});

function Page() {
  const list = useServerFn(listFirmInvoices);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { (async () => { try { setRows(await list()); } finally { setLoading(false); } })(); }, []);

  return (
    <div className="space-y-6 p-6">
      <PageHeader eyebrow="Espace Cabinet" title="Facturation" description="Devis et factures émis par les membres du cabinet." />
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>N°</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Client</TableHead>
              <TableHead className="hidden md:table-cell">Avocat</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Montant</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            : rows.length === 0 ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Aucune facture.</TableCell></TableRow>
            : rows.map((i) => {
              const cs: any = i.client_snapshot ?? {};
              const clientName = cs.first_name || cs.last_name ? `${cs.first_name ?? ""} ${cs.last_name ?? ""}`.trim() : (cs.name ?? "—");
              return (
                <TableRow key={i.id}>
                  <TableCell className="font-mono text-xs"><Link to="/facturation/$id" params={{ id: i.id }} className="text-navy hover:underline">{i.number ?? "—"}</Link></TableCell>
                  <TableCell className="text-sm capitalize">{i.kind === "quote" ? "Devis" : "Facture"}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{clientName}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{i.owner_name ?? "—"}</TableCell>
                  <TableCell><Badge variant={i.status === "paid" ? "default" : "secondary"}>{i.status}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{Number(i.total).toLocaleString("fr-FR")} {i.currency}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
