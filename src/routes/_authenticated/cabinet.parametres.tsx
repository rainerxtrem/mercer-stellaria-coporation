import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyFirm, updateMyFirm } from "@/lib/firm-admin.functions";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/cabinet/parametres")({
  head: () => ({ meta: [{ title: "Paramètres du cabinet" }] }),
  component: Page,
});

function Page() {
  const get = useServerFn(getMyFirm);
  const upd = useServerFn(updateMyFirm);
  const [firm, setFirm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => setFirm(await get()))(); }, []);

  async function save() {
    setSaving(true);
    try {
      await upd({ data: { name: firm.name, address: firm.address, manager: firm.manager, logo_url: firm.logo_url } });
      toast.success("Cabinet mis à jour.");
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSaving(false); }
  }

  if (!firm) return <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6 p-6">
      <PageHeader eyebrow="Espace Cabinet" title="Paramètres" description="Informations générales du cabinet." />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Identité du cabinet</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <div><Label>Numéro d'enregistrement</Label><Input value={firm.number} disabled /></div>
          <div><Label>Nom</Label><Input value={firm.name ?? ""} onChange={(e) => setFirm({ ...firm, name: e.target.value })} /></div>
          <div><Label>Adresse</Label><Input value={firm.address ?? ""} onChange={(e) => setFirm({ ...firm, address: e.target.value })} /></div>
          <div><Label>Responsable</Label><Input value={firm.manager ?? ""} onChange={(e) => setFirm({ ...firm, manager: e.target.value })} /></div>
          <div><Label>Logo (URL)</Label><Input value={firm.logo_url ?? ""} onChange={(e) => setFirm({ ...firm, logo_url: e.target.value })} /></div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving} className="bg-navy text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
