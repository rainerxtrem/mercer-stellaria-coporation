import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Loader2, Mail, Eye, EyeOff, Wand2, UserPlus, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { upsertLawyer, deleteLawyer, setLawyerStatus, listLawyersAdmin } from "@/lib/registry.functions";
import { inviteLawyer } from "@/lib/invitations.functions";
import { createLawyerAccount } from "@/lib/lawyer-accounts.functions";
import { listUserRoles, setUserRoles } from "@/lib/roles-admin.functions";
import { ALL_APP_ROLES, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { Checkbox } from "@/components/ui/checkbox";

type Lawyer = {
  id: string;
  license: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  firm_id: string | null;
  specialty: string | null;
  city: string | null;
  status: "active" | "suspended" | "revoked";
  admitted_on: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  bio: string | null;
  firms?: { name: string } | null;
};
type Firm = { id: string; name: string };

export const Route = createFileRoute("/_authenticated/admin/avocats")({
  head: () => ({ meta: [{ title: "Registre des avocats — Administration" }] }),
  component: Page,
});

const EMPTY: Omit<Lawyer, "id" | "firms"> = {
  license: "SBA-",
  first_name: "",
  last_name: "",
  photo_url: null,
  firm_id: null,
  specialty: null,
  city: null,
  status: "active",
  admitted_on: new Date().toISOString().slice(0, 10),
  email: null,
  phone: null,
  address: null,
  bio: null,
};

function Page() {
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<(Partial<Lawyer> & typeof EMPTY) | null>(null);
  const [saving, setSaving] = useState(false);
  const upsert = useServerFn(upsertLawyer);
  const del = useServerFn(deleteLawyer);
  const setStatus = useServerFn(setLawyerStatus);
  const listAdmin = useServerFn(listLawyersAdmin);
  const invite = useServerFn(inviteLawyer);
  const createAccount = useServerFn(createLawyerAccount);
  const listRoles = useServerFn(listUserRoles);
  const saveRoles = useServerFn(setUserRoles);
  const [inviting, setInviting] = useState<null | { email: string; first_name: string; last_name: string; license: string; firm_id: string | null }>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [creating, setCreating] = useState<null | CreateAccountForm>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [rolesFor, setRolesFor] = useState<Lawyer | null>(null);

  async function refresh() {
    setLoading(true);
    const [l, { data: f }] = await Promise.all([
      listAdmin(),
      supabase.from("firms").select("id, name").order("name"),
    ]);
    setLawyers((l ?? []) as Lawyer[]);
    setFirms((f ?? []) as Firm[]);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  const filtered = useMemo(() => {
    const t = q.toLowerCase();
    if (!t) return lawyers;
    return lawyers.filter((l) =>
      [l.first_name, l.last_name, l.license, l.specialty, l.city, l.firms?.name].join(" ").toLowerCase().includes(t),
    );
  }, [q, lawyers]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const payload: any = { ...editing };
      // ensure nulls not empty strings
      for (const k of ["photo_url","firm_id","specialty","city","email","phone","address","bio"]) {
        if (payload[k] === "" ) payload[k] = null;
      }
      await upsert({ data: payload });
      toast.success(editing.id ? "Avocat mis à jour." : "Avocat inscrit au registre.");
      setEditing(null);
      void refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(l: Lawyer) {
    if (!confirm(`Supprimer définitivement Me ${l.first_name} ${l.last_name} ?`)) return;
    try {
      await del({ data: { id: l.id } });
      toast.success("Avocat supprimé.");
      void refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  }

  async function changeStatus(l: Lawyer, s: Lawyer["status"]) {
    try {
      await setStatus({ data: { id: l.id, status: s } });
      toast.success("Statut mis à jour.");
      void refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-navy-deep">Registre des avocats</h2>
          <p className="text-sm text-muted-foreground">Ajouter, modifier, suspendre ou radier un avocat inscrit au Barreau.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setInviting({ email: "", first_name: "", last_name: "", license: "SBA-", firm_id: null })}>
            <Mail className="mr-2 h-4 w-4" />Inviter par email
          </Button>
          <Button
            onClick={() => setCreating({
              email: "", password: "", password_confirm: "",
              first_name: "", last_name: "", license: "SBA-",
              admitted_on: new Date().toISOString().slice(0, 10),
              role: "avocat", firm_id: null, specialty: "", city: "", phone: "",
            })}
            className="bg-navy text-white hover:bg-navy-deep"
          >
            <UserPlus className="mr-2 h-4 w-4" />Créer un compte avocat
          </Button>
          <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={() => setEditing({ ...EMPTY })}>
                <Plus className="mr-2 h-4 w-4" />Fiche seule (sans compte)
              </Button>
            </DialogTrigger>
            <LawyerDialog editing={editing} setEditing={setEditing} firms={firms} onSave={save} saving={saving} />
          </Dialog>
        </div>
      </div>

      <Dialog open={inviting !== null} onOpenChange={(o) => !o && setInviting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Inviter un avocat au Barreau</DialogTitle></DialogHeader>
          {inviting && (
            <div className="grid gap-3">
              <div className="space-y-1"><Label>Email *</Label><Input type="email" value={inviting.email} onChange={(e) => setInviting({ ...inviting, email: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Prénom *</Label><Input value={inviting.first_name} onChange={(e) => setInviting({ ...inviting, first_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Nom *</Label><Input value={inviting.last_name} onChange={(e) => setInviting({ ...inviting, last_name: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>Licence *</Label><Input value={inviting.license} onChange={(e) => setInviting({ ...inviting, license: e.target.value })} /></div>
              <div className="space-y-1"><Label>Cabinet</Label>
                <Select value={inviting.firm_id ?? "none"} onValueChange={(v) => setInviting({ ...inviting, firm_id: v === "none" ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">Un email d'invitation sera envoyé. Dès la première connexion, le compte sera automatiquement lié à cette fiche avec le rôle « avocat ».</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviting(null)}>Annuler</Button>
            <Button
              className="bg-navy text-white hover:bg-navy-deep"
              disabled={inviteBusy || !inviting?.email || !inviting?.license}
              onClick={async () => {
                if (!inviting) return;
                setInviteBusy(true);
                try {
                  const res = await invite({ data: { ...inviting, redirect_to: `${window.location.origin}/auth` } });
                  toast.success(res.alreadyRegistered ? "Fiche mise à jour (utilisateur déjà inscrit)." : "Invitation envoyée.");
                  setInviting(null);
                  void refresh();
                } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
                finally { setInviteBusy(false); }
              }}
            >
              {inviteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer l'invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateAccountDialog
        form={creating}
        setForm={setCreating}
        firms={firms}
        busy={createBusy}
        onSubmit={async () => {
          if (!creating) return;
          if (creating.password !== creating.password_confirm) {
            toast.error("Les mots de passe ne correspondent pas.");
            return;
          }
          if (creating.password.length < 8) {
            toast.error("Le mot de passe doit contenir au moins 8 caractères.");
            return;
          }
          setCreateBusy(true);
          try {
            await createAccount({ data: {
              email: creating.email.trim(),
              password: creating.password,
              first_name: creating.first_name.trim(),
              last_name: creating.last_name.trim(),
              license: creating.license.trim(),
              admitted_on: creating.admitted_on,
              role: creating.role,
              firm_id: creating.firm_id,
              specialty: creating.specialty || null,
              city: creating.city || null,
              phone: creating.phone || null,
              status: "active",
            } });
            toast.success(`Compte créé pour ${creating.first_name} ${creating.last_name}.`);
            setCreating(null);
            void refresh();
          } catch (e: any) {
            toast.error(e?.message ?? "Erreur lors de la création du compte.");
          } finally {
            setCreateBusy(false);
          }
        }}
      />


      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="pl-9" />
          </div>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary">
            <TableRow>
              <TableHead>Avocat</TableHead>
              <TableHead>Licence</TableHead>
              <TableHead className="hidden md:table-cell">Cabinet</TableHead>
              <TableHead className="hidden lg:table-cell">Spécialité</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-navy" /></TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Aucun avocat au registre. Cliquez sur "Nouvel avocat" pour commencer.</TableCell></TableRow>
            ) : filtered.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    {l.photo_url ? <img src={l.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <div className="grid h-10 w-10 place-items-center rounded-full bg-secondary font-semibold text-navy">{l.first_name[0]}{l.last_name[0]}</div>}
                    <div>
                      <div className="font-medium text-navy-deep">Me {l.first_name} {l.last_name}</div>
                      <div className="text-xs text-muted-foreground">{l.city ?? "—"}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{l.license}</TableCell>
                <TableCell className="hidden md:table-cell text-sm">{l.firms?.name ?? "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-sm">{l.specialty ?? "—"}</TableCell>
                <TableCell>
                  <Select value={l.status} onValueChange={(v) => changeStatus(l, v as Lawyer["status"])}>
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="suspended">Suspendue</SelectItem>
                      <SelectItem value="revoked">Radiée</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setRolesFor(l)} title="Gérer les rôles" disabled={!(l as any).profile_id}>
                    <ShieldCheck className="h-4 w-4 text-navy" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ ...EMPTY, ...l })}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(l)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="text-xs text-muted-foreground">
        Astuce : le badge <Badge variant="outline">Suspendue</Badge> se met à jour instantanément côté public.
      </div>

      <RolesDialog
        lawyer={rolesFor}
        onClose={() => setRolesFor(null)}
        loadRoles={async (userId) => (await listRoles({ data: { user_id: userId } })) as AppRole[]}
        onSave={async (userId, roles) => {
          await saveRoles({ data: { user_id: userId, roles } });
          window.dispatchEvent(new CustomEvent("sba:roles-changed"));
          toast.success("Rôles mis à jour.");
          setRolesFor(null);
        }}
      />
    </div>
  );
}

function LawyerDialog({ editing, setEditing, firms, onSave, saving }: {
  editing: any; setEditing: (v: any) => void; firms: Firm[]; onSave: () => void; saving: boolean;
}) {
  if (!editing) return null;
  const set = (k: string, v: any) => setEditing({ ...editing, [k]: v });
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{editing.id ? "Modifier l'avocat" : "Nouvel avocat"}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1"><Label>Licence *</Label><Input value={editing.license} onChange={(e) => set("license", e.target.value)} /></div>
        <div className="space-y-1"><Label>Date d'admission *</Label><Input type="date" value={editing.admitted_on} onChange={(e) => set("admitted_on", e.target.value)} /></div>
        <div className="space-y-1"><Label>Prénom *</Label><Input value={editing.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
        <div className="space-y-1"><Label>Nom *</Label><Input value={editing.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
        <div className="space-y-1 md:col-span-2"><Label>Photo (URL)</Label><Input value={editing.photo_url ?? ""} onChange={(e) => set("photo_url", e.target.value)} placeholder="https://..." /></div>
        <div className="space-y-1"><Label>Cabinet</Label>
          <Select value={editing.firm_id ?? "none"} onValueChange={(v) => set("firm_id", v === "none" ? null : v)}>
            <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun</SelectItem>
              {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Statut</Label>
          <Select value={editing.status} onValueChange={(v) => set("status", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspendue</SelectItem>
              <SelectItem value="revoked">Radiée</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label>Spécialité</Label><Input value={editing.specialty ?? ""} onChange={(e) => set("specialty", e.target.value)} /></div>
        <div className="space-y-1"><Label>Ville</Label><Input value={editing.city ?? ""} onChange={(e) => set("city", e.target.value)} /></div>
        <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={editing.email ?? ""} onChange={(e) => set("email", e.target.value)} /></div>
        <div className="space-y-1"><Label>Téléphone</Label><Input value={editing.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
        <div className="space-y-1 md:col-span-2"><Label>Adresse</Label><Input value={editing.address ?? ""} onChange={(e) => set("address", e.target.value)} /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setEditing(null)}>Annuler</Button>
        <Button onClick={onSave} disabled={saving} className="bg-navy text-white hover:bg-navy-deep">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

type CreateAccountForm = {
  email: string;
  password: string;
  password_confirm: string;
  first_name: string;
  last_name: string;
  license: string;
  admitted_on: string;
  role: "avocat" | "batonnier";
  firm_id: string | null;
  specialty: string;
  city: string;
  phone: string;
};

function generatePassword(len = 16): string {
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  const arr = new Uint32Array(len);
  (globalThis.crypto ?? window.crypto).getRandomValues(arr);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function CreateAccountDialog({
  form, setForm, firms, busy, onSubmit,
}: {
  form: CreateAccountForm | null;
  setForm: (v: CreateAccountForm | null) => void;
  firms: Firm[];
  busy: boolean;
  onSubmit: () => void;
}) {
  const [showPw, setShowPw] = useState(false);
  if (!form) return null;
  const set = <K extends keyof CreateAccountForm>(k: K, v: CreateAccountForm[K]) => setForm({ ...form, [k]: v });
  return (
    <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Créer un compte avocat</DialogTitle></DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1 md:col-span-2">
            <Label>Adresse e-mail *</Label>
            <Input type="email" autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="jean.dupont@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Mot de passe *</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input type={showPw ? "text" : "password"} autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label="Afficher/masquer">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button type="button" variant="outline" size="icon" title="Générer un mot de passe sécurisé" onClick={() => {
                const pw = generatePassword(16);
                setForm({ ...form, password: pw, password_confirm: pw });
                setShowPw(true);
              }}>
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Confirmer le mot de passe *</Label>
            <Input type={showPw ? "text" : "password"} autoComplete="new-password" value={form.password_confirm} onChange={(e) => set("password_confirm", e.target.value)} />
          </div>
          <div className="space-y-1"><Label>Prénom *</Label><Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} /></div>
          <div className="space-y-1"><Label>Nom *</Label><Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} /></div>
          <div className="space-y-1"><Label>N° de licence *</Label><Input value={form.license} onChange={(e) => set("license", e.target.value)} placeholder="SBA-2026-0001" /></div>
          <div className="space-y-1"><Label>Date d'admission *</Label><Input type="date" value={form.admitted_on} onChange={(e) => set("admitted_on", e.target.value)} /></div>
          <div className="space-y-1">
            <Label>Rôle *</Label>
            <Select value={form.role} onValueChange={(v) => set("role", v as CreateAccountForm["role"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="avocat">Avocat</SelectItem>
                <SelectItem value="batonnier">CEO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Cabinet</Label>
            <Select value={form.firm_id ?? "none"} onValueChange={(v) => set("firm_id", v === "none" ? null : v)}>
              <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Aucun</SelectItem>
                {firms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Spécialité</Label><Input value={form.specialty} onChange={(e) => set("specialty", e.target.value)} /></div>
          <div className="space-y-1"><Label>Ville</Label><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div className="space-y-1 md:col-span-2"><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        </div>
        <p className="text-xs text-muted-foreground">
          Le compte est créé immédiatement dans le système d'authentification. En cas d'échec à une étape, aucune donnée n'est conservée.
          Communiquez le mot de passe à l'avocat par un canal sécurisé.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setForm(null)} disabled={busy}>Annuler</Button>
          <Button
            onClick={onSubmit}
            disabled={busy || !form.email || !form.password || !form.first_name || !form.last_name || !form.license}
            className="bg-navy text-white hover:bg-navy-deep"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Créer le compte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RolesDialog({
  lawyer, onClose, loadRoles, onSave,
}: {
  lawyer: (Lawyer & { profile_id?: string | null }) | null;
  onClose: () => void;
  loadRoles: (userId: string) => Promise<AppRole[]>;
  onSave: (userId: string, roles: AppRole[]) => Promise<void>;
}) {
  const [roles, setRoles] = useState<Set<AppRole>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const profileId = (lawyer as any)?.profile_id as string | null | undefined;

  useEffect(() => {
    if (!lawyer || !profileId) return;
    setLoading(true);
    loadRoles(profileId)
      .then((rs) => setRoles(new Set(rs)))
      .finally(() => setLoading(false));
  }, [lawyer?.id]);

  function toggle(r: AppRole) {
    const next = new Set(roles);
    if (next.has(r)) next.delete(r); else next.add(r);
    setRoles(next);
  }

  return (
    <Dialog open={lawyer !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Rôles &amp; permissions
            {lawyer && <span className="ml-2 text-sm font-normal text-muted-foreground">— Me {lawyer.first_name} {lawyer.last_name}</span>}
          </DialogTitle>
        </DialogHeader>
        {!profileId ? (
          <p className="text-sm text-muted-foreground">
            Cet avocat n'a pas encore de compte utilisateur. Créez d'abord un compte pour lui attribuer des rôles.
          </p>
        ) : loading ? (
          <div className="grid place-items-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Les rôles sont cumulables. Chaque rôle débloque son propre espace de travail dans le sélecteur d'espace.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ALL_APP_ROLES.map((r) => (
                <label key={r} className="flex items-start gap-3 rounded-md border border-border p-3 hover:bg-accent">
                  <Checkbox checked={roles.has(r)} onCheckedChange={() => toggle(r)} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{ROLE_LABELS[r]}</div>
                    <div className="text-xs text-muted-foreground capitalize">{r}</div>
                  </div>
                </label>
              ))}
            </div>
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
