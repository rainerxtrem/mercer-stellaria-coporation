import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/site/PageHeader";
import { listPublishedNews } from "@/lib/public-content.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/actualites")({
  head: () => ({ meta: [
    { title: "Actualités — Mercer & Stellaria Corporation" },
    { name: "description", content: "Communiqués officiels, nominations, réformes et décisions publiées par le Mercer & Stellaria Corporation." },
    { property: "og:title", content: "Actualités — Mercer & Stellaria Corporation" },
    { property: "og:description", content: "Publications officielles du Mercer & Stellaria Corporation." },
  ] }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listPublishedNews);
  const { data: news = [], isLoading } = useQuery({
    queryKey: ["public-news-all"], queryFn: () => listFn(), staleTime: 60_000,
  });

  return (
    <>
      <PageHeader eyebrow="Publications" title="Actualités du Barreau" description="Communiqués officiels, nominations, réformes, décisions disciplinaires et évènements." />
      <section className="container-page py-12">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />Chargement…
          </div>
        ) : news.length === 0 ? (
          <div className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground">
            Aucune actualité publiée pour le moment.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {news.map((n: any) => (
              <Card key={n.id} className="overflow-hidden shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]">
                <div className="h-1.5 bg-gold" />
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-muted-foreground">
                    {n.tag && <span className="rounded bg-navy/10 px-2 py-0.5 font-semibold text-navy">{n.tag}</span>}
                    {(n.published_at || n.created_at) && (
                      <span>{new Date(n.published_at ?? n.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</span>
                    )}
                  </div>
                  <h3 className="mt-3 font-display text-lg font-bold text-navy-deep">{n.title}</h3>
                  {n.excerpt && <p className="mt-2 text-sm text-muted-foreground">{n.excerpt}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
