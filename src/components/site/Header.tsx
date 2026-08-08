import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, ShieldCheck, LogIn, LogOut, LayoutDashboard, User as UserIcon, FolderOpen, Users, FileText, Gauge } from "lucide-react";
import logo from "@/assets/ms-logo.png";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { useSession, useIsBatonnier, signOut } from "@/lib/auth";
import { NotificationsBell } from "@/components/site/NotificationsBell";
import { GlobalSearch } from "@/components/site/GlobalSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/avocats", label: "Avocats" },
  { to: "/assurances", label: "Assurances" },
  { to: "/investment", label: "Investissement" },
] as const;

export function Header() {
  const [open, setOpen] = useState(false);
  const session = useSession();
  const isAdmin = useIsBatonnier();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const onHome = pathname === "/";

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container-page flex h-20 items-center justify-between gap-4">
        <Link to="/" className="group flex min-w-0 items-center gap-3">
          <img src={logo} alt={BRAND.name} width={44} height={44} className="h-11 w-11 shrink-0 object-contain transition-transform duration-500 group-hover:scale-105" />
          <div className="min-w-0 leading-tight">
            <div className="font-display text-base font-bold tracking-tight text-foreground sm:text-lg">{BRAND.shortName}</div>
            <div className="truncate text-[10px] uppercase tracking-[0.22em] text-gold">HOLDING | LAW OFFICE | INSURANCE | INVESTMENT</div>
          </div>
        </Link>
        <nav className="hidden xl:flex items-center gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="relative rounded-md px-3 py-2 text-sm font-medium text-foreground/75 transition-all duration-300 hover:bg-secondary hover:text-foreground"
              activeProps={{ className: "bg-secondary text-foreground shadow-[inset_0_-2px_0_0_var(--gold)]" }}
              activeOptions={{ exact: n.to === "/" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          {session && !onHome && <GlobalSearch />}
          {!session && (
            <Button asChild variant="outline" size="sm" className="press border-gold/50 text-gold transition-colors hover:bg-gold hover:text-[#0a0e16]">
              <Link to="/connexion"><ShieldCheck className="mr-1.5 h-4 w-4" />Connexion Espaces Clients</Link>
            </Button>
          )}
          {session && <NotificationsBell />}
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="press bg-navy text-white hover:bg-navy-soft">
                  <UserIcon className="mr-1.5 h-4 w-4" />
                  {session.user.email?.split("@")[0] ?? "Compte"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
                    <LayoutDashboard className="mr-2 h-4 w-4" />Administration
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate({ to: "/tableau-de-bord" })}>
                  <Gauge className="mr-2 h-4 w-4" />Tableau de bord
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/dossiers" })}>
                  <FolderOpen className="mr-2 h-4 w-4" />Mes dossiers
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/clients" })}>
                  <Users className="mr-2 h-4 w-4" />Mes clients
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/facturation" })}>
                  <FileText className="mr-2 h-4 w-4" />Facturation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/espace-avocat" })}>
                  <UserIcon className="mr-2 h-4 w-4" />Mon espace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut(navigate)}>
                  <LogOut className="mr-2 h-4 w-4" />Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild size="sm" className="press bg-navy text-white hover:bg-navy-soft">
                <Link to="/auth"><LogIn className="mr-1.5 h-4 w-4" />Connexion</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="text-foreground/85 hover:text-foreground">
                <Link to="/inscription">Créer un compte</Link>
              </Button>
            </div>
          )}
        </div>
        <button className="xl:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>
      {open && (
        <div className="xl:hidden border-t border-border bg-background">
          <div className="container-page flex flex-col py-3">
            {NAV.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-secondary hover:text-foreground"
              >
                {n.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
              {!session && (
                <Button asChild variant="outline" className="border-gold/50 text-gold">
                  <Link to="/connexion" onClick={() => setOpen(false)}>Connexion Espaces Clients</Link>
                </Button>
              )}
              {session ? (
                <>
                  {isAdmin && (
                    <Button asChild className="bg-navy text-white">
                      <Link to="/admin" onClick={() => setOpen(false)}>Administration</Link>
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => { setOpen(false); signOut(navigate); }}>
                    Se déconnecter
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild className="bg-navy text-white">
                    <Link to="/auth" onClick={() => setOpen(false)}>Connexion</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link to="/inscription" onClick={() => setOpen(false)}>Créer un compte</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
