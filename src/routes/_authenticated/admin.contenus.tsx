import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { upsertSiteContent } from "@/lib/registry.functions";

type Content = { key: string; title: string | null; body: string };

export const Route = createFileRoute("/_authenticated/admin/contenus")({
  head: () => ({ meta: [{ title: "Contenus éditables — Administration" }] }),
  component: Page,
});

// 11 sections institutionnelles éditables (Markdown supporté, images/liens inline).
const SECTIONS = [
  { key: "presentation",       label: "Présentation du Barreau" },
  { key: "histoire",           label: "Histoire" },
  { key: "organisation",       label: "Organisation" },
  { key: "admissions",         label: "Conditions d'admission" },
  { key: "examen",             label: "Examen du Barreau" },
  { key: "aide_juridictionnelle", label: "Aide juridictionnelle" },
  { key: "tarification",       label: "Tarification" },
  { key: "faq",                label: "FAQ" },
  { key: "contact_info",       label: "Contact (bloc info)" },
  { key: "mentions_legales",   label: "Mentions légales" },
  { key: "confidentialite",    label: "Politique de confidentialité" },
];

function Page() {
  const [contents, setContents] = useState<Record<string, Content>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const upsert = useServerFn(upsertSiteContent);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("site_content").select("*").in("key", SECTIONS.map((s) => s.key));
      const m: Record<string, Content> = {};
      for (const s of SECTIONS) m[s.key] = { key: s.key, title: s.label, body: "" };
      for (const c of data ?? []) m[c.key] = c as Content;
      setContents(m);
      setLoading(false);
    })();
  }, []);

  async function save(key: string) {
    setSaving(key);
    try {
      const c = contents[key];
      await upsert({ data: { key, title: c.title ?? "", body: c.body } });
      toast.success("Contenu enregistré.");
    } catch (e: any) { toast.error(e?.message ?? "Erreur"); }
    finally { setSaving(null); }
  }

  if (loading) return <div className="grid min-h-[40vh] place-items-center"><Loader2 className="h-6 w-6 animate-spin text-navy" /></div>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h2 className="font-display text-xl font-bold text-navy-deep">Contenus institutionnels</h2>
        <p className="text-sm text-muted-foreground">Modifiez librement toutes les pages institutionnelles publiques. Markdown supporté (titres <code>#</code>, gras <code>**</code>, italique <code>*</code>, listes <code>-</code>, liens <code>[texte](url)</code>).</p>
      </div>
      <Tabs defaultValue={SECTIONS[0].key} className="w-full">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          {SECTIONS.map((s) => <TabsTrigger key={s.key} value={s.key} className="text-xs">{s.label}</TabsTrigger>)}
        </TabsList>
        {SECTIONS.map((s) => (
          <TabsContent key={s.key} value={s.key}>
            <Card className="shadow-[var(--shadow-card)]">
              <CardContent className="space-y-4 p-6">
                <div className="space-y-1">
                  <Label>Titre affiché</Label>
                  <Input value={contents[s.key]?.title ?? ""} onChange={(e) => setContents({ ...contents, [s.key]: { ...contents[s.key], title: e.target.value } })} />
                </div>
                <div className="space-y-1">
                  <Label>Contenu (Markdown supporté)</Label>
                  <Textarea rows={18} value={contents[s.key]?.body ?? ""} onChange={(e) => setContents({ ...contents, [s.key]: { ...contents[s.key], body: e.target.value } })} className="font-mono text-sm" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => save(s.key)} disabled={saving === s.key} className="bg-navy text-white hover:bg-navy-deep">
                    {saving === s.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" />Enregistrer</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
