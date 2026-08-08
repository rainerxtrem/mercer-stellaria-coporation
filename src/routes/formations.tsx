import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/site/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GraduationCap, Clock, Loader2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listPublishedTrainings } from "@/lib/trainings.functions";

type T = {
  id: string; slug: string; title: string; description: string | null;
  cover_url: string | null; duration_min: number; pass_threshold: number;
  training_categories?: { name: string } | null;
};

export const Route = createFileRoute("/formations")({
  head: () => ({ meta: [{ title: "Formation continue — Mercer & Stellaria Corporation" }] }),
  component: Page,
});

function Page() {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const list = useServerFn(listPublishedTrainings);
  useEffect(() => { (async () => { setItems(((await list()) ?? []) as T[]); setLoading(false); })(); }, []);

  return (
    <>
      <PageHeader eyebrow="Formation continue" title="Catalogue de formations" description="Le Barreau propose un catalogue complet de formations certifiantes pour maintenir l'excellence professionnelle." />
      <section className="container-page py-12">
        {loading ? (
          <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-navy" /></div>
        ) : items.length === 0 ? (
          <div className="grid place-items-center py-16 text-center text-sm text-muted-foreground">
            Aucune formation publiée pour le moment. Le CEO peut en publier depuis l'administration.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {items.map((c) => (
              <Card key={c.id} className="overflow-hidden shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-elegant)]">
                {c.cover_url && <img src={c.cover_url} alt="" className="h-40 w-full object-cover" loading="lazy" />}
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-navy text-gold"><GraduationCap className="h-6 w-6" /></div>
                  {c.training_categories?.name && (
                    <div className="text-xs uppercase tracking-wider text-gold">{c.training_categories.name}</div>
                  )}
                  <div className="font-display text-lg font-bold text-navy-deep">{c.title}</div>
                  {c.description && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{c.description}</p>}
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 text-gold" /> {c.duration_min} min · seuil {c.pass_threshold}%
                  </div>
                  <Button asChild className="mt-5 w-full bg-navy hover:bg-navy-deep">
                    <Link to="/formations/$slug" params={{ slug: c.slug }}>Suivre la formation</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
