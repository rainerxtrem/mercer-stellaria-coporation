import { type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, FileCheck2, Files, LayoutDashboard, LogOut, MessageSquare, Scale } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useSession, signOut } from "@/lib/auth";

type PortalNavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const NAV_ITEMS: PortalNavItem[] = [
  { to: "/portail-client", label: "Dashboard", icon: LayoutDashboard },
  { to: "/portail-client/dossiers", label: "Mes dossiers", icon: Scale },
  { to: "/portail-client/documents", label: "Documents", icon: Files },
  { to: "/portail-client/signatures", label: "A signer", icon: FileCheck2 },
  { to: "/portail-client/messages", label: "Messages", icon: MessageSquare },
  { to: "/portail-client/notifications", label: "Notifications", icon: Bell },
];

export function ClientPortalShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="min-h-screen bg-[#070b14] text-zinc-100">
      <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="border-b border-zinc-800/80 bg-[#0c1220] lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-5 py-5 lg:block">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">Mercer & Stellaria</p>
              <h1 className="mt-1 font-display text-lg font-semibold text-zinc-50">Portail Client</h1>
            </div>
            <Badge className="border border-amber-500/40 bg-amber-500/10 text-amber-300">Espace isole</Badge>
          </div>
          <Separator className="bg-zinc-800/80" />
          <nav className="grid gap-1 px-3 py-3">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    active
                      ? "bg-amber-500/12 text-amber-300"
                      : "text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <Separator className="bg-zinc-800/80" />
          <div className="space-y-3 px-4 py-4 text-xs text-zinc-400">
            <p className="truncate">{session?.user.email ?? "client"}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="border-zinc-700 bg-transparent text-zinc-200" asChild>
                <Link to="/">Site public</Link>
              </Button>
              <Button size="sm" variant="outline" className="border-zinc-700 bg-transparent text-zinc-200" onClick={() => signOut(navigate)}>
                <LogOut className="mr-1 h-3.5 w-3.5" />Deconnexion
              </Button>
            </div>
          </div>
        </aside>

        <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(212,175,55,0.08),_transparent_45%),linear-gradient(180deg,#090f1b_0%,#070b14_100%)]">
          {children}
        </main>
      </div>
    </div>
  );
}
