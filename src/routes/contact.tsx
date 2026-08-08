import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/site/PageHeader";
import { CmsSection } from "@/components/site/CmsSection";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MapPin, Phone, Mail, Clock, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { submitContactRequest } from "@/lib/public-content.functions";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [
    { title: "Contact — Mercer & Stellaria Corporation" },
    { name: "description", content: "Formulaire officiel de contact du Mercer & Stellaria Corporation." },
    { property: "og:title", content: "Contact — Mercer & Stellaria Corporation" },
    { property: "og:description", content: "Contactez le Mercer & Stellaria Corporation." },
  ] }),
  component: Page,
});

function Page() {
  const submit = useServerFn(submitContactRequest);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", subject: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.subject.trim() || form.message.trim().length < 5) {
      toast.error("Merci de remplir tous les champs (message d'au moins 5 caractères).");
      return;
    }
    setSending(true);
    try {
      await submit({ data: form });
      setSent(true);
      setForm({ first_name: "", last_name: "", email: "", subject: "", message: "" });
      toast.success("Votre demande a bien été transmise au Barreau.");
    } catch (err: any) {
      toast.error(err?.message ?? "Envoi impossible pour le moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Contact" title="Nous contacter" description="Le Barreau se tient à la disposition des avocats, des citoyens et des institutions." />
      <section className="container-page grid gap-8 py-12 lg:grid-cols-3">
        <div className="space-y-4">
          <CmsSection contentKey="contact_info" />
          {[
            { icon: MapPin, title: "Adresse", text: "1 Legislative Plaza, Los Santos 90001" },
            { icon: Phone, title: "Téléphone", text: "+1 (555) 123-4567" },
            { icon: Mail, title: "Email", text: "contact@sanandreasbar.gov" },
            { icon: Clock, title: "Horaires", text: "Lun-Ven : 09h00 - 17h30" },
          ].map((i) => (
            <Card key={i.title} className="shadow-[var(--shadow-card)]">
              <CardContent className="flex items-start gap-4 p-5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-navy text-gold"><i.icon className="h-5 w-5" /></div>
                <div><div className="font-display font-bold text-navy-deep">{i.title}</div><div className="text-sm text-muted-foreground">{i.text}</div></div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="lg:col-span-2 shadow-[var(--shadow-card)]">
          <CardContent className="p-8">
            <h2 className="font-display text-2xl font-bold text-navy-deep gold-underline">Formulaire de contact</h2>
            {sent ? (
              <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                <div className="font-display text-lg font-bold text-emerald-900">Demande transmise</div>
                <p className="text-sm text-emerald-800">Le secrétariat du Barreau vous répondra dans les meilleurs délais.</p>
                <Button variant="outline" onClick={() => setSent(false)}>Envoyer une nouvelle demande</Button>
              </div>
            ) : (
              <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
                <div><Label>Prénom *</Label><Input className="mt-1.5" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} maxLength={60} required /></div>
                <div><Label>Nom *</Label><Input className="mt-1.5" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} maxLength={60} required /></div>
                <div className="sm:col-span-2"><Label>Email *</Label><Input type="email" className="mt-1.5" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={200} required /></div>
                <div className="sm:col-span-2"><Label>Sujet *</Label><Input className="mt-1.5" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} maxLength={200} required /></div>
                <div className="sm:col-span-2"><Label>Message *</Label><Textarea rows={6} className="mt-1.5" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} maxLength={4000} required /></div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={sending} className="bg-navy hover:bg-navy-deep">
                    {sending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Envoi…</> : "Envoyer le message"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
