import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { upsertFirm, deleteFirm } from "@/lib/registry.functions";

type Firm = { id: string; number: string; name: string; address: string | null; manager: string | null; logo_url: string | null; status: "active" | "suspended" | "revoked" };

export const Route = createFileRoute("/_authenticated/admin/cabinets")({
  head: () => ({ meta: [{ title: "Cabinets — Administration" }] }),
  component: Page,
});

const EMPTY = { number: "FRM-", name: "", address: "", manager: "", logo_url: "", status: "active" as const };

function Page() {
  const [firms, setFirms] = useState<Firm[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const upsert = useServerFn(upsertFirm);
  const del = useServerFn(deleteFirm);

  async function refresh() {
    setLoading(true);
    const { data } = await supabase.from("firms").select("*").order("name");
    setFirms((data ?? []) as Firm[]);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  async function save() {
    setSaving(true);
    try {
      const payload = { ...editing };
      for (const k of ["address","manager","logo_url"]) if (payload[k] === "") payload[k] = null;
      await upsert({ data: payload });
      toast.success("Cabinet enregistré.");
      setEditing(null);
      void refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSaving(false); }
  }

  async function handleDelete(f: Firm) {
    if (!confirm(`Dissoudre le cabinet "${f.name}" ?`)) return;
    try { await del({ data: { id: f.id } }); toast.success("Cabinet dissous."); void refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-navy-deep">Registre des cabinets</h2>
          <p className="text-sm text-muted-foreground">Enregistrer, modifier ou dissoudre un cabinet.</p>
        </div>
        <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditing({ ...EMPTY })} className="bg-navy text-white hover:bg-navy-deep"><Plus className="mr-2 h-4 w-4" />Nouveau cabinet</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            {editing && <>
              <DialogHeader><DialogTitle>{editing.id ? "Modifier le cabinet" : "Nouveau cabinet"}</DialogTitle></DialogHeader>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1"><Label>Numéro *</Label><Input value={editing.number} onChange={(e) => setEditing({ ...editing, number: e.target.value })} /></div>
                <div className="space-y-1"><Label>Statut</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspendue</SelectItem>
                      <SelectItem value="revoked">Dissoute</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 md:col-span-2"><Label>Nom *</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div className="space-y-1 md:col-span-2"><Label>Adresse</Label><Input value={editing.address ?? ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
                <div className="space-y-1"><Label>Responsable</Label><Input value={editing.manager ?? ""} onChange={(e) => setEditing({ ...editing, manager: e.target.value })} /></div>
                <div className="space-y-1"><Label>Logo (URL)</Label><Input value={editing.logo_url ?? ""} onChange={(e) => setEditing({ ...editing, logo_url: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
                <Button onClick={save} disabled={saving} className="bg-navy text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}</Button>
              </DialogFooter>
            </>}
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>Cabinet</TableHead>
              <TableHead>Numéro</TableHead>
              <TableHead className="hidden md:table-cell">Responsable</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            : firms.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Aucun cabinet enregistré.</TableCell></TableRow>
            : firms.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {f.logo_url ? <img src={f.logo_url} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="grid h-8 w-8 place-items-center rounded bg-navy text-xs font-bold text-gold">{f.name[0]}</div>}
                    <div>
                      <div className="font-medium text-navy-deep">{f.name}</div>
                      <div className="text-xs text-muted-foreground">{f.address ?? "—"}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{f.number}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{f.manager ?? "—"}</TableCell>
                <TableCell className="text-xs capitalize">{f.status}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...f })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(f)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
