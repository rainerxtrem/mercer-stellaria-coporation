import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, ShieldPlus } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { grantRole } from "@/lib/registry.functions";

type Row = { user_id: string; role: string };

export const Route = createFileRoute("/_authenticated/admin/roles")({
  head: () => ({ meta: [{ title: "Rôles — Administration" }] }),
  component: Page,
});

function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"batonnier" | "avocat" | "citoyen">("avocat");
  const [saving, setSaving] = useState(false);
  const grant = useServerFn(grantRole);

  async function refresh() {
    setLoading(true);
    const { data } = await supabase.from("user_roles").select("user_id, role").order("role");
    setRows((data ?? []) as Row[]);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await grant({ data: { user_email: email, role } });
      toast.success(`Rôle ${role} accordé.`);
      setEmail("");
      void refresh();
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-navy-deep">Rôles &amp; accès</h2>
        <p className="text-sm text-muted-foreground">Nommer un CEO, attribuer le rôle Avocat ou Citoyen à un utilisateur inscrit.</p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-6">
          <form onSubmit={submit} className="grid gap-4 md:grid-cols-[1fr_200px_auto]">
            <div className="space-y-1"><Label>E-mail de l'utilisateur</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="utilisateur@example.com" /></div>
            <div className="space-y-1"><Label>Rôle à accorder</Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="batonnier">CEO (admin)</SelectItem>
                  <SelectItem value="avocat">Avocat</SelectItem>
                  <SelectItem value="citoyen">Citoyen</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="bg-navy text-white hover:bg-navy-deep">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ShieldPlus className="mr-2 h-4 w-4" />Accorder</>}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader className="bg-secondary"><TableRow><TableHead>Utilisateur (ID)</TableHead><TableHead>Rôle</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={2} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></TableCell></TableRow>
            : rows.length === 0 ? <TableRow><TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">Aucun rôle attribué.</TableCell></TableRow>
            : rows.map((r) => (
              <TableRow key={`${r.user_id}-${r.role}`}>
                <TableCell className="font-mono text-xs">{r.user_id}</TableCell>
                <TableCell className="text-sm capitalize">{r.role}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
