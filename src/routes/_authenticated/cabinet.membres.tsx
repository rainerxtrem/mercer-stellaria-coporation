import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listFirmMembers, inviteFirmMember, removeFirmMember } from "@/lib/firm-admin.functions";
import { listUserRoles, setUserRoles } from "@/lib/roles-admin.functions";
import { ROLE_LABELS, type AppRole } from "@/lib/auth";
import { PageHeader } from "@/components/site/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, ShieldCheck } from "lucide-react";

const MANAGED_ROLES: AppRole[] = ["avocat", "assistant", "citoyen"];

export const Route = createFileRoute("/_authenticated/cabinet/membres")({
  head: () => ({
    meta: [
      { title: "Membres du cabinet — Mercer & Stellaria Corporation" },
      { name: "description", content: "Gestion sécurisée des membres, invitations et rôles du cabinet." },
      { property: "og:title", content: "Membres du cabinet — Mercer & Stellaria Corporation" },
      { property: "og:description", content: "Gestion sécurisée des membres, invitations et rôles du cabinet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const list = useServerFn(listFirmMembers);
  const invite = useServerFn(inviteFirmMember);
  const remove = useServerFn(removeFirmMember);
  const listRoles = useServerFn(listUserRoles);
  const saveRoles = useServerFn(setUserRoles);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rolesFor, setRolesFor] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ email: "", first_name: "", last_name: "", role: "avocat", license: "", specialty: "", city: "" });

  async function refresh() {
    setLoading(true);
    try { setMembers(await list()); } finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  async function submit() {
    setSaving(true);
    try {
      await invite({ data: { ...form, redirect_to: `${window.location.origin}/auth` } });
      toast.success("Invitation envoyée.");
      setOpen(false);
      setForm({ email: "", first_name: "", last_name: "", role: "avocat", license: "", specialty: "", city: "" });
      void refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSaving(false); }
  }

  async function handleRemove(id: string, name: string) {
    if (!confirm(`Retirer ${name} du cabinet ?`)) return;
    try { await remove({ data: { lawyer_id: id } }); toast.success("Membre retiré."); void refresh(); }
    catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <PageHeader eyebrow="Espace Cabinet" title="Membres" description="Avocats et assistants du cabinet." />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-navy text-white hover:bg-navy-deep"><UserPlus className="mr-2 h-4 w-4" />Inviter un membre</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Inviter un membre</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Rôle</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avocat">Avocat</SelectItem>
                    <SelectItem value="assistant">Assistant juridique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Prénom</Label><Input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} /></div>
                <div><Label>Nom</Label><Input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} /></div>
              </div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              {form.role === "avocat" && (
                <>
                  <div><Label>N° de licence</Label><Input value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} placeholder="SA-BAR-2026-0001" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Spécialité</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
                    <div><Label>Ville</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                  </div>
                </>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button onClick={submit} disabled={saving} className="bg-navy text-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer l'invitation"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>Membre</TableHead>
              <TableHead>Licence</TableHead>
              <TableHead className="hidden md:table-cell">Spécialité</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={5} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            : members.length === 0 ? <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Aucun membre pour ce cabinet.</TableCell></TableRow>
            : members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-medium text-navy-deep">{m.first_name} {m.last_name}</div>
                  <div className="text-xs text-muted-foreground">{m.email ?? "—"}</div>
                </TableCell>
                <TableCell className="font-mono text-xs">{m.license}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{m.specialty ?? "—"}</TableCell>
                <TableCell><Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setRolesFor(m)} title="Gérer les rôles" disabled={!m.profile_id}>
                    <ShieldCheck className="h-4 w-4 text-navy" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleRemove(m.id, `${m.first_name} ${m.last_name}`)}>
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <FirmRolesDialog
        member={rolesFor}
        onClose={() => setRolesFor(null)}
        loadRoles={async (userId) => (await listRoles({ data: { user_id: userId } })) as AppRole[]}
        onSave={async (userId, roles) => {
          await saveRoles({ data: { user_id: userId, roles } });
          window.dispatchEvent(new CustomEvent("sba:roles-changed"));
          toast.success("Rôles du membre mis à jour.");
          setRolesFor(null);
        }}
      />
    </div>
  );
}

function FirmRolesDialog({
  member, onClose, loadRoles, onSave,
}: {
  member: any | null;
  onClose: () => void;
  loadRoles: (userId: string) => Promise<AppRole[]>;
  onSave: (userId: string, roles: AppRole[]) => Promise<void>;
}) {
  const [roles, setRoles] = useState<Set<AppRole>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const profileId = member?.profile_id as string | null | undefined;

  useEffect(() => {
    if (!member || !profileId) return;
    setLoading(true);
    loadRoles(profileId)
      .then((rs) => setRoles(new Set(rs.filter((r) => MANAGED_ROLES.includes(r)))))
      .catch((e: any) => toast.error(e?.message ?? "Impossible de charger les rôles."))
      .finally(() => setLoading(false));
  }, [member?.id]);

  function toggle(role: AppRole) {
    const next = new Set(roles);
    if (next.has(role)) next.delete(role); else next.add(role);
    setRoles(next);
  }

  return (
    <Dialog open={member !== null} onOpenChange={(openState) => !openState && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Rôles du membre
            {member && <span className="ml-2 text-sm font-normal text-muted-foreground">— {member.first_name} {member.last_name}</span>}
          </DialogTitle>
        </DialogHeader>
        {!profileId ? (
          <p className="text-sm text-muted-foreground">Ce membre n'a pas encore de compte utilisateur lié.</p>
        ) : loading ? (
          <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="grid gap-2">
            {MANAGED_ROLES.map((role) => (
              <label key={role} className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-accent">
                <Checkbox checked={roles.has(role)} onCheckedChange={() => toggle(role)} />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground">{ROLE_LABELS[role]}</div>
                  <div className="text-xs text-muted-foreground capitalize">{role}</div>
                </div>
              </label>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button
            className="bg-navy text-white hover:bg-navy-deep"
            disabled={!profileId || saving || loading}
            onClick={async () => {
              if (!profileId) return;
              setSaving(true);
              try { await onSave(profileId, [...roles]); }
              catch (e: any) { toast.error(e?.message ?? "Erreur"); }
              finally { setSaving(false); }
            }}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer les rôles"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
