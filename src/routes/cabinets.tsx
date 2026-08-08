import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { listPublicFirms } from "@/lib/public-registry.functions";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./avocats";
import { Building2, MapPin, User, Calendar, Loader2 } from "lucide-react";

export const Route = createFileRoute("/cabinets")({
  head: () => ({
    meta: [
      { title: "Registre des cabinets — Mercer & Stellaria Corporation" },
      { name: "description", content: "Tous les cabinets d'avocats autorisés à exercer du groupe Mercer & Stellaria." },
      { property: "og:title", content: "Registre des cabinets — Mercer & Stellaria Corporation" },
      { property: "og:description", content: "Cabinets d'avocats enregistrés au Mercer & Stellaria Corporation." },
    ],
  }),
  component: Page,
});

type Firm = {
  id: string;
  number: string;
  name: string;
  address: string | null;
  manager: string | null;
  logo_url: string | null;
  status: "active" | "suspended" | "revoked";
  createdOn: string | null;
};

function Page() {
  const listFn = useServerFn(listPublicFirms);
  const { data: firms = [], isLoading } = useQuery({
    queryKey: ["public-firms"],
    queryFn: () => listFn() as Promise<Firm[]>,
    staleTime: 60_000,
  });

  return (
    <>
      <PageHeader eyebrow="Registre officiel" title="Cabinets enregistrés" description="Tous les cabinets d'avocats autorisés à exercer du groupe Mercer & Stellaria." />
      <section className="container-page py-12">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />Chargement du registre…
          </div>
        ) : firms.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
            Aucun cabinet enregistré au registre pour le moment.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {firms.map((f) => (
              <Card key={f.id} className="shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    {f.logo_url ? (
                      <img src={f.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-contain" />
                    ) : (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-navy text-gold">
                        <Building2 className="h-7 w-7" />
                      </div>
                    )}
                    <StatusBadge status={f.status} />
                  </div>
                  <div className="mt-4 font-display text-lg font-bold text-navy-deep">{f.name}</div>
                  <div className="text-xs font-mono text-muted-foreground">{f.number}</div>
                  <div className="mt-4 space-y-2 text-sm">
                    {f.address && <Row icon={MapPin}>{f.address}</Row>}
                    {f.manager && <Row icon={User}>{f.manager}</Row>}
                    {f.createdOn && <Row icon={Calendar}>Créé en {new Date(f.createdOn).getFullYear()}</Row>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Row({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-navy-deep/80">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <span>{children}</span>
    </div>
  );
}
