import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { submitComplaint } from "@/lib/disciplinary.functions";
import { listPublicLawyers } from "@/lib/public-registry.functions";
import { PageHeader } from "@/components/site/PageHeader";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Scale, ShieldAlert, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/signalement")({
  head: () => ({
    meta: [
      { title: "Déposer un signalement — Commission disciplinaire" },
      { name: "description", content: "Formulaire de signalement d'un manquement déontologique par un avocat inscrit au Mercer & Stellaria Corporation." },
      { property: "og:title", content: "Signalement disciplinaire — Mercer & Stellaria Corporation" },
      { property: "og:description", content: "Saisissez la Commission disciplinaire du Barreau." },
    ],
  }),
  component: Page,
});

function Page() {
  const submit = useServerFn(submitComplaint);
  const lawyersFn = useServerFn(listPublicLawyers);
  const { data: lawyers } = useQuery({ queryKey: ["public-lawyers-select"], queryFn: () => lawyersFn() });

  const [form, setForm] = useState({ complainant_name: "", complainant_email: "", complainant_phone: "", lawyer_id: "", lawyer_name_input: "", subject: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await submit({
        data: {
          complainant_name: form.complainant_name,
          complainant_email: form.complainant_email,
          complainant_phone: form.complainant_phone || undefined,
          lawyer_id: form.lawyer_id || undefined,
          lawyer_name_input: form.lawyer_name_input || undefined,
          subject: form.subject,
          description: form.description,
        },
      });
      setDone(true);
    } catch (e: any) { toast.error(e.message ?? "Envoi impossible"); }
    finally { setSubmitting(false); }
  }

  return (
    <>
      <Header />
      <PageHeader eyebrow="Commission disciplinaire" title="Déposer un signalement" description="Toute personne peut saisir la direction d'un manquement déontologique commis par un avocat inscrit au Barreau." />
      <main className="container-page py-12">
        {done ? (
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-10 text-center shadow-[var(--shadow-card)]">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-600" />
            <h2 className="mt-4 font-display text-2xl font-bold text-navy-deep">Signalement enregistré</h2>
            <p className="mt-2 text-sm text-muted-foreground">La Commission disciplinaire examinera votre demande dans les meilleurs délais. Un accusé de réception vous sera envoyé par courriel.</p>
            <Button asChild className="mt-6 bg-navy"><Link to="/">Retour à l'accueil</Link></Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mx-auto grid max-w-3xl gap-4 rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2 text-navy-deep"><Scale className="h-5 w-5" /><h2 className="font-display text-xl font-bold">Formulaire de saisine</h2></div>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label>Nom complet *</Label><Input required value={form.complainant_name} onChange={(e) => setForm({ ...form, complainant_name: e.target.value })} /></div>
              <div><Label>Email *</Label><Input required type="email" value={form.complainant_email} onChange={(e) => setForm({ ...form, complainant_email: e.target.value })} /></div>
              <div><Label>Téléphone</Label><Input value={form.complainant_phone} onChange={(e) => setForm({ ...form, complainant_phone: e.target.value })} /></div>
              <div>
                <Label>Avocat visé (registre)</Label>
                <select className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.lawyer_id} onChange={(e) => setForm({ ...form, lawyer_id: e.target.value })}>
                  <option value="">— Non listé —</option>
                  {(lawyers ?? []).map((l: any) => (
                    <option key={l.id} value={l.id}>Me {l.first_name} {l.last_name} — {l.license}</option>
                  ))}
                </select>
              </div>
            </div>
            {!form.lawyer_id && <div><Label>Nom de l'avocat visé (si absent du registre)</Label><Input value={form.lawyer_name_input} onChange={(e) => setForm({ ...form, lawyer_name_input: e.target.value })} /></div>}
            <div><Label>Objet *</Label><Input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Ex : manquement au devoir de conseil" /></div>
            <div><Label>Description des faits *</Label><Textarea required rows={8} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Décrivez précisément les faits, dates, pièces éventuelles…" /></div>
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">Toute déclaration mensongère peut faire l'objet de poursuites. Vos coordonnées ne seront communiquées qu'aux membres de la Commission.</div>
            <div className="flex justify-end"><Button type="submit" disabled={submitting} className="bg-navy">{submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Envoyer le signalement</Button></div>
          </form>
        )}
      </main>
      <Footer />
    </>
  );
}
