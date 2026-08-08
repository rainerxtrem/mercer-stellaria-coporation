import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Users, Building2, Newspaper, BookOpen, ShieldCheck, Activity, Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Tableau de bord — Administration" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const [stats, setStats] = useState({ lawyers: 0, firms: 0, active: 0, news: 0, articles: 0 });
  const [activity, setActivity] = useState<Array<{ id: string; summary: string | null; action: string; created_at: string }>>([]);

  useEffect(() => {
    (async () => {
      const [l, f, la, n, a, log] = await Promise.all([
        supabase.from("lawyers").select("id", { count: "exact", head: true }),
        supabase.from("firms").select("id", { count: "exact", head: true }),
        supabase.from("lawyers").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("news").select("id", { count: "exact", head: true }),
        supabase.from("library_articles").select("id", { count: "exact", head: true }),
        supabase.from("audit_log").select("id, summary, action, created_at").order("created_at", { ascending: false }).limit(15),
      ]);
      setStats({
        lawyers: l.count ?? 0,
        firms: f.count ?? 0,
        active: la.count ?? 0,
        news: n.count ?? 0,
        articles: a.count ?? 0,
      });
      setActivity(log.data ?? []);
    })();
  }, []);

  const cards = [
    { label: "Avocats inscrits", value: stats.lawyers, icon: Users },
    { label: "Cabinets", value: stats.firms, icon: Building2 },
    { label: "Licences actives", value: stats.active, icon: ShieldCheck },
    { label: "Actualités", value: stats.news, icon: Newspaper },
    { label: "Bibliothèque", value: stats.articles, icon: BookOpen },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild className="bg-navy text-white hover:bg-navy-deep">
          <Link to="/admin/enterprises"><Plus className="mr-2 h-4 w-4" />+ Nouvelle entreprise</Link>
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-[var(--shadow-card)]">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-navy text-gold"><c.icon className="h-5 w-5" /></div>
              <div>
                <div className="font-display text-2xl font-bold text-navy-deep">{c.value}</div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="p-6">
          <h2 className="font-display text-lg font-bold text-navy-deep gold-underline">Journal d'activité récent</h2>
          <ul className="mt-6 space-y-3 text-sm">
            {activity.length === 0 ? (
              <li className="text-muted-foreground">Aucune action enregistrée pour l'instant.</li>
            ) : activity.map((a) => (
              <li key={a.id} className="flex items-start gap-3 border-l-2 border-gold pl-3">
                <Activity className="mt-0.5 h-4 w-4 text-navy" />
                <div className="flex-1">
                  <div className="font-medium text-navy-deep">{a.summary ?? a.action}</div>
                  <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString("fr-FR")}</div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
