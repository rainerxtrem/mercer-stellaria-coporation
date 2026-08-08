import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listMatters, createMatter, deleteMatter } from "@/lib/matters.functions";
import { listClients } from "@/lib/clients.functions";
import { toast } from "sonner";
import { FolderOpen, Plus, Trash2, Search } from "lucide-react";
import { matterStatusMeta, MATTER_STATUS_OPTIONS } from "@/lib/matter-status";

export const Route = createFileRoute("/_authenticated/dossiers/")({
  head: () => ({ meta: [{ title: "Mes dossiers — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

function StatusBadge({ status }: { status: string }) {
  const m = matterStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${m.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}


function Page() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listFn = useServerFn(listMatters);
  const listClientsFn = useServerFn(listClients);
  const createFn = useServerFn(createMatter);
  const deleteFn = useServerFn(deleteMatter);

  const matters = useQuery({
    queryKey: ["matters", status, search],
    queryFn: () => listFn({ data: { search, status } }),
  });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => listClientsFn() });

  const create = useMutation({
    mutationFn: (v: any) => createFn({ data: v }),
    onSuccess: (r) => {
      toast.success(`Dossier ${r.number} créé`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["matters"] });
      navigate({ to: "/dossiers/$matterId", params: { matterId: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Dossier supprimé");
      qc.invalidateQueries({ queryKey: ["matters"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [form, setForm] = useState({ title: "", client_id: "", type: "", description: "", status: "open" as const });

  return (
    <>
      <PageHeader eyebrow="Espace Avocat" title="Mes dossiers juridiques" description="Créez, organisez et gérez vos dossiers en toute confidentialité." />
      <section className="container-page py-10">
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par titre ou numéro…" className="pl-9" />
              </div>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {MATTER_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{matterStatusMeta(s).label}</SelectItem>
                  ))}
                  <SelectItem value="archived">Archivés</SelectItem>
                </SelectContent>

              </Select>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-navy text-white hover:bg-navy-deep"><Plus className="mr-1.5 h-4 w-4" />Nouveau dossier</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Créer un dossier</DialogTitle></DialogHeader>
                  <div className="grid gap-3">
                    <div>
                      <Label>Titre *</Label>
                      <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex. Affaire Doe c/ État" />
                    </div>
                    <div>
                      <Label>Client</Label>
                      <Select value={form.client_id || "__none"} onValueChange={(v) => setForm({ ...form, client_id: v === "__none" ? "" : v })}>
                        <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none">Aucun</SelectItem>
                          {(clients.data ?? []).map((c: any) => (
                            <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Type</Label>
                      <Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Civil, pénal, commercial…" />
                    </div>
                    <div>
                      <Label>Description</Label>
                      <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                    <Button
                      disabled={!form.title.trim() || create.isPending}
                      onClick={() => create.mutate({
                        title: form.title.trim(),
                        client_id: form.client_id || undefined,
                        type: form.type || undefined,
                        description: form.description || undefined,
                        status: form.status,
                      })}
                      className="bg-navy text-white"
                    >Créer</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="mt-6 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numéro</TableHead>
                    <TableHead>Titre</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Ouvert le</TableHead>
                    <TableHead className="w-20 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(matters.data ?? []).map((m: any) => (
                    <TableRow key={m.id} className="cursor-pointer" onClick={() => navigate({ to: "/dossiers/$matterId", params: { matterId: m.id } })}>
                      <TableCell className="font-mono text-xs">{m.number}</TableCell>
                      <TableCell className="font-medium">{m.title}</TableCell>
                      <TableCell>{m.clients ? `${m.clients.first_name} ${m.clients.last_name}` : "—"}</TableCell>
                      <TableCell><StatusBadge status={m.status} /></TableCell>
                      <TableCell>{m.opened_on}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon" variant="ghost"
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Supprimer le dossier ${m.number} ? Les fichiers seront perdus.`)) del.mutate(m.id); }}
                          aria-label="Supprimer"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(matters.data ?? []).length === 0 && !matters.isLoading && (
                    <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      <FolderOpen className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      Aucun dossier. Créez votre premier dossier pour commencer.
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 text-sm text-muted-foreground">
          <Link to="/clients" className="text-navy underline">Gérer mes clients →</Link>
        </div>
      </section>
    </>
  );
}
