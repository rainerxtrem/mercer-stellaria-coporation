import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listClients, upsertClient, deleteClient } from "@/lib/clients.functions";
import { toast } from "sonner";
import { Trash2, Pencil, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Mes clients — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

type ClientRow = {
  id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  birth_date: string;
  portal_unique_id: string;
  notes: string;
};
const empty: ClientRow = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  address: "",
  birth_date: "",
  portal_unique_id: "",
  notes: "",
};

function Page() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow>(empty);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listClients);
  const upsertFn = useServerFn(upsertClient);
  const deleteFn = useServerFn(deleteClient);

  const clients = useQuery({ queryKey: ["clients"], queryFn: () => listFn() });
  const save = useMutation({
    mutationFn: (v: ClientRow) => upsertFn({ data: {
      id: v.id,
      first_name: v.first_name.trim(),
      last_name: v.last_name.trim(),
      email: v.email.trim() || null,
      phone: v.phone.trim() || null,
      address: v.address.trim() || null,
      birth_date: v.birth_date || null,
      portal_unique_id: v.portal_unique_id.trim() || null,
      notes: v.notes.trim() || null,
    } as any }),
    onSuccess: () => {
      toast.success("Client enregistré");
      setOpen(false);
      setEditing(empty);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => { toast.success("Client supprimé"); qc.invalidateQueries({ queryKey: ["clients"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNew() { setEditing(empty); setOpen(true); }
  function openEdit(c: any) {
    setEditing({
      id: c.id,
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      birth_date: c.birth_date ?? "",
      portal_unique_id: c.portal_unique_id ?? "",
      notes: c.notes ?? "",
    });
    setOpen(true);
  }

  return (
    <>
      <PageHeader eyebrow="Espace Avocat" title="Mes clients" description="Carnet confidentiel de vos clients." />
      <section className="container-page py-10">
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{(clients.data ?? []).length} client(s)</div>
              <Button onClick={openNew} className="bg-navy text-white hover:bg-navy-deep"><UserPlus className="mr-1.5 h-4 w-4" />Nouveau client</Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>ID unique</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(clients.data ?? []).map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.last_name.toUpperCase()} {c.first_name}</TableCell>
                      <TableCell>{c.email ?? "—"}</TableCell>
                      <TableCell>{c.portal_unique_id ?? "—"}</TableCell>
                      <TableCell>{c.phone ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate">{c.address ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(c)} aria-label="Éditer"><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Supprimer ${c.first_name} ${c.last_name} ?`)) del.mutate(c.id); }} aria-label="Supprimer">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(clients.data ?? []).length === 0 && !clients.isLoading && (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Aucun client enregistré.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-sm text-muted-foreground">
          <Link to="/dossiers" className="text-navy underline">← Mes dossiers</Link>
        </div>
      </section>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing.id ? "Modifier le client" : "Nouveau client"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Prénom *</Label><Input value={editing.first_name} onChange={(e) => setEditing({ ...editing, first_name: e.target.value })} /></div>
            <div><Label>Nom *</Label><Input value={editing.last_name} onChange={(e) => setEditing({ ...editing, last_name: e.target.value })} /></div>
            <div><Label>Email</Label><Input type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
            <div><Label>Téléphone</Label><Input value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
            <div><Label>ID unique</Label><Input value={editing.portal_unique_id} onChange={(e) => setEditing({ ...editing, portal_unique_id: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Adresse</Label><Input value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
            <div><Label>Date de naissance</Label><Input type="date" value={editing.birth_date} onChange={(e) => setEditing({ ...editing, birth_date: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Notes</Label><Textarea rows={3} value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
            <Button
              disabled={!editing.first_name.trim() || !editing.last_name.trim() || save.isPending}
              onClick={() => save.mutate(editing)}
              className="bg-navy text-white"
            >Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
