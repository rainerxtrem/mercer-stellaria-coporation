import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listBackups, createBackup, getBackupDownloadUrl, deleteBackup } from "@/lib/audit.functions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Database, Download, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/sauvegardes")({
  head: () => ({ meta: [{ title: "Sauvegardes — Administration" }] }),
  component: Page,
});

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function Page() {
  const list = useServerFn(listBackups);
  const create = useServerFn(createBackup);
  const dl = useServerFn(getBackupDownloadUrl);
  const del = useServerFn(deleteBackup);
  const qc = useQueryClient();
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["backups"], queryFn: () => list() });

  const createMut = useMutation({
    mutationFn: () => create({ data: { note: note || undefined } }),
    onSuccess: () => { toast.success("Sauvegarde créée"); setNote(""); qc.invalidateQueries({ queryKey: ["backups"] }); },
    onError: (e: any) => toast.error(e.message ?? "Échec de la sauvegarde"),
  });

  const downloadOne = async (id: string) => {
    try {
      const { url } = await dl({ data: { id } });
      window.open(url, "_blank");
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Sauvegarde supprimée"); qc.invalidateQueries({ queryKey: ["backups"] }); },
    onError: (e: any) => toast.error(e.message ?? "Suppression échouée"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-navy-deep">Sauvegardes</h2>
        <p className="text-sm text-muted-foreground">Instantanés JSON de la base — dossiers, factures, avocats, formations, journal…</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-navy-deep">
          <Database className="h-4 w-4" /> Nouvelle sauvegarde
        </div>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optionnelle) — motif, contexte…" rows={2} />
        <div className="mt-3 flex justify-end">
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
            {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Créer une sauvegarde
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Fichier</TableHead>
              <TableHead>Taille</TableHead>
              <TableHead>Tables</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            ) : (data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Aucune sauvegarde. Créez-en une pour démarrer.</TableCell></TableRow>
            ) : (data ?? []).map((b: any) => {
              const total = Object.values(b.row_counts ?? {}).reduce((a: number, n: any) => a + Number(n), 0);
              return (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-nowrap text-xs">{new Date(b.created_at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell className="font-mono text-xs">{b.filename}</TableCell>
                  <TableCell className="text-xs">{fmtBytes(Number(b.size_bytes))}</TableCell>
                  <TableCell className="text-xs">{(b.tables?.length ?? 0)} tables • {total} lignes</TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm">{b.note ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => downloadOne(b.id)}><Download className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="ml-1 text-destructive" onClick={() => { if (confirm("Supprimer cette sauvegarde ?")) deleteMut.mutate(b.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
