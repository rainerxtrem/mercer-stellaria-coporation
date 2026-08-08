import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listContactRequests, updateContactStatus, deleteContactRequest } from "@/lib/contact-admin.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail, Trash2, Eye } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/admin/demandes")({
  head: () => ({ meta: [{ title: "Demandes de contact — Administration" }] }),
  component: Page,
});

type Request = {
  id: string; first_name: string; last_name: string; email: string;
  subject: string; message: string;
  status: "nouveau" | "en_cours" | "traite" | "archive";
  created_at: string;
};

const STATUS_LABEL: Record<Request["status"], string> = {
  nouveau: "Nouveau", en_cours: "En cours", traite: "Traité", archive: "Archivé",
};
const STATUS_CLASS: Record<Request["status"], string> = {
  nouveau: "bg-warning/15 text-warning",
  en_cours: "bg-info/15 text-info",
  traite: "bg-success/15 text-success",
  archive: "bg-secondary text-secondary-foreground",
};

function Page() {
  const listFn = useServerFn(listContactRequests);
  const updateFn = useServerFn(updateContactStatus);
  const delFn = useServerFn(deleteContactRequest);
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<Request | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["contact-requests"],
    queryFn: () => listFn() as Promise<Request[]>,
  });

  const mutate = useMutation({
    mutationFn: (v: { id: string; status: Request["status"] }) => updateFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact-requests"] }); toast.success("Statut mis à jour."); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contact-requests"] }); toast.success("Demande supprimée."); },
    onError: (e: any) => toast.error(e?.message ?? "Erreur"),
  });

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="font-display text-xl font-bold text-navy-deep">Demandes de contact</h2>
        <p className="text-sm text-muted-foreground">Toutes les demandes envoyées via le formulaire public.</p>
      </div>
      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-secondary">
              <TableRow>
                <TableHead>Demandeur</TableHead>
                <TableHead>Sujet</TableHead>
                <TableHead className="hidden md:table-cell">Reçue le</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Aucune demande reçue.</TableCell></TableRow>
              ) : items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium text-navy-deep">{r.first_name} {r.last_name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{r.email}</div>
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate">{r.subject}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{new Date(r.created_at).toLocaleString("fr-FR")}</TableCell>
                  <TableCell>
                    <Select value={r.status} onValueChange={(v) => mutate.mutate({ id: r.id, status: v as Request["status"] })}>
                      <SelectTrigger className={`h-8 w-[130px] text-xs ${STATUS_CLASS[r.status]} border-0`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABEL) as Array<keyof typeof STATUS_LABEL>).map((k) => (
                          <SelectItem key={k} value={k}>{STATUS_LABEL[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => { if (confirm("Supprimer cette demande ?")) del.mutate(r.id); }}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl">
          {viewing && (
            <>
              <DialogHeader><DialogTitle>{viewing.subject}</DialogTitle></DialogHeader>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">De :</span> {viewing.first_name} {viewing.last_name}{" "}
                  <a href={`mailto:${viewing.email}`} className="text-navy underline">&lt;{viewing.email}&gt;</a>
                </div>
                <div><span className="text-muted-foreground">Reçue le :</span> {new Date(viewing.created_at).toLocaleString("fr-FR")}</div>
                <div className="whitespace-pre-wrap rounded-md border border-border bg-secondary/50 p-4 text-navy-deep">
                  {viewing.message}
                </div>
                <Button asChild className="bg-navy text-white">
                  <a href={`mailto:${viewing.email}?subject=${encodeURIComponent("Re: " + viewing.subject)}`}>Répondre par email</a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
