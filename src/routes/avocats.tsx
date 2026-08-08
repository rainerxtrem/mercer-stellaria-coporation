import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { listPublicLawyers } from "@/lib/public-registry.functions";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Loader2 } from "lucide-react";

export const Route = createFileRoute("/avocats")({
  head: () => ({
    meta: [
      { title: "Registre des avocats — Mercer & Stellaria Corporation" },
      { name: "description", content: "Consultez le registre officiel des avocats inscrits au Mercer & Stellaria Corporation." },
      { property: "og:title", content: "Registre des avocats — Mercer & Stellaria Corporation" },
      { property: "og:description", content: "Registre officiel des avocats inscrits au Mercer & Stellaria Corporation." },
    ],
  }),
  component: Page,
});

const PAGE_SIZE = 12;

type Lawyer = {
  id: string;
  license: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  specialty: string | null;
  city: string | null;
  status: "active" | "suspended" | "revoked";
  admitted_on: string;
  firms: { name: string | null } | null;
};

function Page() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");
  const [spec, setSpec] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);

  const listFn = useServerFn(listPublicLawyers);
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["public-lawyers"],
    queryFn: () => listFn() as Promise<Lawyer[]>,
    staleTime: 60_000,
  });

  const cities = useMemo(() => Array.from(new Set(rows.map((l) => l.city).filter(Boolean))) as string[], [rows]);
  const specs = useMemo(() => Array.from(new Set(rows.map((l) => l.specialty).filter(Boolean))) as string[], [rows]);

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    return rows.filter((l) => {
      if (city !== "all" && l.city !== city) return false;
      if (spec !== "all" && l.specialty !== spec) return false;
      if (status !== "all" && l.status !== status) return false;
      if (!term) return true;
      return [l.first_name, l.last_name, l.license, l.firms?.name ?? ""].join(" ").toLowerCase().includes(term);
    });
  }, [rows, q, city, spec, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <PageHeader eyebrow="Registre officiel" title="Avocats inscrits" description="Consultez l'ensemble des avocats inscrits au Mercer & Stellaria Corporation." />
      <section className="container-page py-12">
        <div className="rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-card)] md:p-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Nom, licence, cabinet…" className="pl-9" />
            </div>
            <Select value={city} onValueChange={(v) => { setCity(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Ville" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les villes</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={spec} onValueChange={(v) => { setSpec(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="Spécialité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les spécialités</SelectItem>
                {specs.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["all", "active", "suspended", "revoked"].map((s) => (
              <button key={s} onClick={() => { setStatus(s); setPage(1); }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${status === s ? "border-navy bg-navy text-white" : "border-border text-muted-foreground hover:border-navy"}`}>
                {s === "all" ? "Tous" : s === "active" ? "Active" : s === "suspended" ? "Suspendue" : "Radiée"}
              </button>
            ))}
            <div className="ml-auto text-sm text-muted-foreground">{filtered.length} résultat{filtered.length > 1 ? "s" : ""}</div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-card)]">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />Chargement du registre…
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Aucun avocat inscrit au registre pour le moment.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-secondary">
                <TableRow>
                  <TableHead>Avocat</TableHead>
                  <TableHead>Licence</TableHead>
                  <TableHead className="hidden md:table-cell">Cabinet</TableHead>
                  <TableHead className="hidden lg:table-cell">Spécialité</TableHead>
                  <TableHead className="hidden lg:table-cell">Ville</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.map((l) => (
                  <TableRow key={l.id} className="hover:bg-secondary/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {l.photo_url ? (
                          <img src={l.photo_url} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover" loading="lazy" />
                        ) : (
                          <div className="grid h-10 w-10 place-items-center rounded-full bg-navy text-xs font-bold text-white">
                            {(l.first_name?.[0] ?? "") + (l.last_name?.[0] ?? "")}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-navy-deep">Me {l.first_name} {l.last_name}</div>
                          <div className="text-xs text-muted-foreground md:hidden">{l.firms?.name ?? "—"}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.license}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{l.firms?.name ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{l.specialty ?? "—"}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{l.city ?? "—"}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost" className="text-navy hover:bg-navy hover:text-white">
                        <Link to="/avocats/$id" params={{ id: l.id }}>Voir</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Page {page} / {totalPages}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Suivant</Button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

export function StatusBadge({ status }: { status: "active" | "suspended" | "revoked" }) {
  const map = {
    active: { label: "Active", cls: "bg-success/15 text-success border-emerald-200" },
    suspended: { label: "Suspendue", cls: "bg-warning/15 text-warning border-amber-200" },
    revoked: { label: "Radiée", cls: "bg-destructive/15 text-destructive border-red-200" },
  }[status];
  return <Badge variant="outline" className={map.cls}>{map.label}</Badge>;
}
