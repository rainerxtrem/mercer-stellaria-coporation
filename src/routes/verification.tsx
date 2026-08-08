import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/site/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "./avocats";
import { ShieldCheck, ShieldAlert, ShieldX, Search, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listPublicLawyers } from "@/lib/public-registry.functions";

type Lawyer = {
  id: string; license: string; first_name: string; last_name: string;
  photo_url: string | null; specialty: string | null; city: string | null;
  status: "active" | "suspended" | "revoked"; admitted_on: string;
  firms?: { name: string } | null;
};

export const Route = createFileRoute("/verification")({
  head: () => ({ meta: [{ title: "Vérifier une licence — Mercer & Stellaria Corporation" }] }),
  validateSearch: (s: Record<string, unknown>): { license?: string } =>
    typeof s.license === "string" ? { license: s.license } : {},

  component: Page,
});

function Page() {
  const { license } = useSearch({ from: "/verification" });
  const [q, setQ] = useState(license ?? "");
  const [lawyers, setLawyers] = useState<Lawyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<null | "notfound" | Lawyer>(null);
  const list = useServerFn(listPublicLawyers);

  useEffect(() => {
    (async () => {
      const data = await list();
      setLawyers((data ?? []) as Lawyer[]);
      setLoading(false);
    })();
  }, []);

  function check(term?: string) {
    const t = (term ?? q).trim().toLowerCase();
    if (!t) return;
    const found = lawyers.find((l) => l.license.toLowerCase() === t);
    setResult(found ?? "notfound");
  }

  useEffect(() => {
    if (license && lawyers.length > 0) { setQ(license); check(license); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [license, lawyers.length]);

  return (
    <>
      <PageHeader eyebrow="Vérification officielle" title="Vérifier une licence" description="Contrôlez en un instant le statut d'une licence d'avocat inscrit au Mercer & Stellaria Corporation." />
      <section className="container-page py-12">
        <Card className="mx-auto max-w-2xl shadow-[var(--shadow-elegant)]">
          <CardContent className="p-8">
            <form onSubmit={(e) => { e.preventDefault(); check(); }} className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex : SBA-1004" className="pl-9 font-mono" />
              </div>
              <Button type="submit" className="bg-navy hover:bg-navy-deep" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vérifier"}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">Saisissez le numéro de licence exact figurant sur la carte professionnelle.</p>
          </CardContent>
        </Card>

        {result && (
          <div className="mx-auto mt-8 max-w-2xl">
            {result === "notfound" ? (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="flex items-center gap-4 p-6">
                  <ShieldX className="h-10 w-10 text-red-600" />
                  <div>
                    <div className="font-display text-lg font-bold text-red-800">Aucune licence trouvée</div>
                    <div className="text-sm text-red-700">Ce numéro n'est pas enregistré dans nos bases.</div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className={`border-2 shadow-[var(--shadow-elegant)] ${result.status === "active" ? "border-emerald-300" : "border-amber-300"}`}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-5">
                    {result.status === "active" ? (
                      <ShieldCheck className="h-12 w-12 text-emerald-600" />
                    ) : (
                      <ShieldAlert className="h-12 w-12 text-amber-600" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><StatusBadge status={result.status} /></div>
                      <div className="mt-2 font-display text-xl font-bold text-navy-deep">Me {result.first_name} {result.last_name}</div>
                      <div className="text-sm text-muted-foreground">{result.firms?.name ?? "Indépendant"} · {result.city ?? "—"}</div>
                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <div><span className="text-muted-foreground">Licence :</span> {result.license}</div>
                        <div><span className="text-muted-foreground">Admis(e) le :</span> {new Date(result.admitted_on).toLocaleDateString("fr-FR")}</div>
                      </div>
                    </div>
                    {result.photo_url && (
                      <img src={result.photo_url} alt="" width={80} height={80} className="hidden h-20 w-20 rounded-full object-cover sm:block" loading="lazy" />
                    )}
                  </div>
                  <div className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                    Vérification signée numériquement · Mercer & Stellaria Corporation
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </section>
    </>
  );
}
