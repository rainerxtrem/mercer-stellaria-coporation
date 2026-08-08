import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { verifyInvoicePublic } from "@/lib/invoices.functions";
import { ShieldCheck, ShieldX } from "lucide-react";
import seal from "@/assets/seal.png";

export const Route = createFileRoute("/verification/facture/$token")({
  head: () => ({ meta: [{ title: "Vérification d'authenticité — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon", sent: "Émis", accepted: "Accepté", refused: "Refusé",
  paid: "Payé", partial: "Partiellement payé", overdue: "En retard",
  cancelled: "Annulé", converted: "Converti en facture",
};

function Page() {
  const { token } = Route.useParams();
  const verifyFn = useServerFn(verifyInvoicePublic);
  const q = useQuery({ queryKey: ["verify", token], queryFn: () => verifyFn({ data: { token } }) });

  return (
    <>
      <PageHeader eyebrow="Vérification officielle" title="Authenticité du document" description="État en direct depuis le Barreau." />
      <section className="container-page py-14">
        <Card className="mx-auto max-w-2xl shadow-[var(--shadow-elegant)]">
          <CardContent className="p-8">
            {q.isLoading && <p className="text-center text-muted-foreground">Vérification en cours…</p>}
            {q.data && !q.data.found && (
              <div className="text-center">
                <ShieldX className="mx-auto h-12 w-12 text-destructive" />
                <h2 className="mt-4 font-display text-xl font-bold text-navy-deep">Document introuvable</h2>
                <p className="mt-2 text-sm text-muted-foreground">Aucun document valide ne correspond à ce code.</p>
              </div>
            )}
            {q.data && q.data.found && (
              <div>
                <div className="flex items-center gap-4">
                  <img src={seal} alt="Sceau" className="h-14 w-14" />
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-gold">Document authentique</div>
                    <div className="flex items-center gap-2 font-display text-xl font-bold text-navy-deep">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      {q.data.kind === "quote" ? "Devis" : "Facture"} {q.data.number}
                    </div>
                  </div>
                </div>
                <dl className="mt-6 grid gap-3 text-sm">
                  <Row label="Émis par" value={q.data.owner_full_name ? `Me ${q.data.owner_full_name}` : "—"} />
                  <Row label="Destinataire" value={q.data.client_name ?? "—"} />
                  <Row label="Date d'émission" value={q.data.issue_date} />
                  <Row label="Statut" value={STATUS_LABELS[q.data.status] ?? q.data.status} />
                  <Row label="Montant total" value={`${q.data.total.toFixed(2)} ${q.data.currency}`} />
                </dl>
                <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                  Cette page confirme l'existence et l'état du document. Les détails (prestations, notes) restent confidentiels et ne sont pas divulgués.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold text-navy-deep">{value}</dd>
    </div>
  );
}
