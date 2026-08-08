import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search, Download, Loader2, Library } from "lucide-react";
import { listLibraryCategories, listLibraryArticles, getLibraryAttachmentUrl } from "@/lib/library.functions";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/bibliotheque")({
  head: () => ({
    meta: [
      { title: "Bibliothèque juridique — Mercer & Stellaria Corporation" },
      { name: "description", content: "Codes, jurisprudences, doctrines et modèles à disposition des avocats du Mercer & Stellaria Corporation." },
      { property: "og:title", content: "Bibliothèque juridique — Mercer & Stellaria Corporation" },
      { property: "og:description", content: "Base documentaire complète pour les avocats." },
    ],
  }),
  component: Page,
});

type Art = {
  id: string; title: string; slug: string; excerpt: string | null;
  tags: string[]; theme: string | null; status: string; category_id: string | null;
  attachment_name: string | null; attachment_mime: string | null;
  library_categories?: { name: string; slug: string } | null;
};

function Page() {
  const session = useSession();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | "all">("all");
  const listCatFn = useServerFn(listLibraryCategories);
  const listArtFn = useServerFn(listLibraryArticles);
  const dlFn = useServerFn(getLibraryAttachmentUrl);

  const cats = useQuery({
    queryKey: ["pub-lib-cats"],
    queryFn: () => listCatFn(),
    enabled: !!session,
  });
  const arts = useQuery({
    queryKey: ["pub-lib-arts", q, cat],
    queryFn: () => listArtFn({ data: { search: q || undefined, category_id: cat !== "all" ? cat : undefined, status: "published" } }),
    enabled: !!session,
  });

  async function download(id: string) {
    const r = await dlFn({ data: { id } });
    window.open(r.url, "_blank", "noopener");
  }

  if (!session) {
    return (
      <>
        <PageHeader eyebrow="Ressources" title="Bibliothèque juridique" description="L'accès à la bibliothèque est réservé aux avocats inscrits au Barreau." />
        <section className="container-page py-16 text-center">
          <Library className="mx-auto h-12 w-12 text-gold" />
          <p className="mt-4 text-muted-foreground">Connectez-vous pour accéder aux codes, jurisprudences et modèles.</p>
          <Button asChild className="mt-4 bg-navy text-white"><Link to="/auth">Se connecter</Link></Button>
        </section>
      </>
    );
  }

  const catList = (cats.data ?? []) as { id: string; name: string; parent_id: string | null }[];
  const rows = (arts.data ?? []) as Art[];

  return (
    <>
      <PageHeader eyebrow="Ressources" title="Bibliothèque juridique" description="Accédez aux codes, lois, jurisprudences, modèles et doctrines publiés par le Barreau." />
      <section className="container-page py-12">
        <div className="mx-auto mb-8 flex max-w-3xl flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un texte, un arrêt, un article…" className="h-11 pl-9" />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="Catégorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              {catList.map((c) => <SelectItem key={c.id} value={c.id}>{c.parent_id ? "↳ " : ""}{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {arts.isLoading ? (
          <div className="grid place-items-center py-12"><Loader2 className="h-6 w-6 animate-spin text-navy" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">Aucun document ne correspond à votre recherche.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((a) => (
              <Card key={a.id} className="transition-all hover:border-gold">
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.library_categories?.name && <Badge variant="outline" className="text-[10px]">{a.library_categories.name}</Badge>}
                      {a.theme && <Badge className="bg-gold/15 text-navy-deep hover:bg-gold/15">{a.theme}</Badge>}
                    </div>
                    <h3 className="mt-1 font-display text-lg font-bold text-navy-deep">{a.title}</h3>
                    {a.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{a.excerpt}</p>}
                    {(a.tags ?? []).length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {a.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>)}
                      </div>
                    )}
                  </div>
                  {a.attachment_name && (
                    <Button size="sm" variant="outline" onClick={() => download(a.id)}>
                      <Download className="mr-2 h-4 w-4" /> {a.attachment_mime?.includes("pdf") ? "PDF" : "Fichier"}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
