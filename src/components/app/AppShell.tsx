import { type ReactNode, useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

import { NotificationsBell } from "@/components/site/NotificationsBell";
import { GlobalSearch } from "@/components/site/GlobalSearch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession, useIsBatonnier, signOut } from "@/lib/auth";
import { Bell, LogOut, User as UserIcon, Shield, ExternalLink } from "lucide-react";
import { useEnterpriseWorkspace } from "@/hooks/use-enterprise-workspace";
import { parseBooleanSearchParam } from "@/lib/boolean-search-param";

export function AppShell({
  children,
  variant = "staff",
  displayName,
}: {
  children: ReactNode;
  variant?: "staff" | "client";
  displayName?: string;
}) {
  const session = useSession();
  const isAdmin = useIsBatonnier();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const { context, activeEnterprise } = useEnterpriseWorkspace();
  const email = session?.user.email ?? "";
  const accountName =
    variant === "client" ? displayName || "Client" : email.split("@")[0] || "Compte";
  const initials = accountName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    if (variant === "staff" && pathname === "/messagerie-professionnelle") {
      void navigate({ to: "/dossiers", search: { messagerie: true }, replace: true });
    }
  }, [navigate, pathname, variant]);

  const deniedByModule = (() => {
    if (!context || !activeEnterprise) return false;
    if (pathname.startsWith("/admin") || pathname.startsWith("/portail-client")) return false;
    if (pathname === "/messagerie-professionnelle") return false;
    if (pathname === "/dossiers" && parseBooleanSearchParam(search.messagerie)) return false;

    const routeTargets = (context.known_route_targets ?? []) as Array<{
      module_slug: string;
      paths: string[];
    }>;
    const matched = routeTargets.find((entry) =>
      entry.paths.some((prefix) => pathname === prefix || pathname.startsWith(prefix + "/")),
    );
    if (!matched) return false;
    return !(activeEnterprise.modules ?? []).includes(matched.module_slug);
  })();

  return (
    <SidebarProvider>
      <AppSidebar variant={variant} clientName={displayName} />
      <SidebarInset className="bg-surface-2">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <div className="flex flex-1 items-center gap-2">
            {variant === "client" ? (
              <div className="text-sm font-medium text-foreground">Espace client</div>
            ) : (
              <GlobalSearch />
            )}
          </div>
          <div className="flex items-center gap-1">
            {variant === "client" ? (
              <Button variant="ghost" size="icon" asChild title="Notifications">
                <Link to="/portail-client/notifications">
                  <Bell className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <NotificationsBell />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 pl-2 pr-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">
                    {initials}
                  </span>
                  <span className="hidden max-w-[160px] truncate md:inline">{accountName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{accountName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {variant === "client" ? "Compte client vérifié" : email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    navigate({ to: variant === "client" ? "/portail-client" : "/espace-avocat" })
                  }
                >
                  <UserIcon className="mr-2 h-4 w-4" />{" "}
                  {variant === "client" ? "Espace client" : "Mon espace"}
                </DropdownMenuItem>
                {variant === "staff" && isAdmin && (
                  <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
                    <Shield className="mr-2 h-4 w-4" /> Administration
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => navigate({ to: "/" })}>
                  <ExternalLink className="mr-2 h-4 w-4" /> Site public
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut(navigate)}>
                  <LogOut className="mr-2 h-4 w-4" /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <div className="min-h-[calc(100dvh-3.5rem)] animate-[fade-in_0.35s_ease-out]">
          {deniedByModule ? (
            <div className="container-page py-16">
              <div className="max-w-2xl rounded-xl border border-border bg-card p-6">
                <h2 className="font-display text-xl font-semibold text-navy-deep">
                  Module non autorise
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Ce module est desactive ou non attribue a vos grades dans l'entreprise active.
                </p>
                <div className="mt-4">
                  <Button
                    onClick={() => navigate({ to: "/tableau-de-bord" })}
                    className="bg-navy text-white hover:bg-navy-deep"
                  >
                    Retour au tableau de bord
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
