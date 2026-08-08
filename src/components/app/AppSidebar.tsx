import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import {
  Gauge, FolderOpen, Users, FileText,
  Shield, Building2, Newspaper, BookOpen, ScrollText, Settings,
  ChevronRight, GraduationCap, Home, Inbox, CheckSquare, Scale, DollarSign, FileStack,
  Receipt, FileCheck2, MessageSquare, CalendarDays,
  Bell,
} from "lucide-react";
import seal from "@/assets/seal.png";
import { useIsBatonnier } from "@/lib/auth";
import { useEnterpriseWorkspace } from "@/hooks/use-enterprise-workspace";
import { EnterpriseSwitcher } from "@/components/app/EnterpriseSwitcher";
import { parseBooleanSearchParam } from "@/lib/boolean-search-param";

type NavEntry = { to: string; label: string; icon: typeof Shield; exact?: boolean };

const CLIENT_NAV: NavEntry[] = [
  { to: "/portail-client", label: "Tableau de bord", icon: Gauge, exact: true },
  { to: "/portail-client/messages", label: "Conversations", icon: MessageSquare },
  { to: "/portail-client/dossiers", label: "Mes dossiers", icon: FolderOpen },
  { to: "/portail-client/documents", label: "Documents", icon: FileText },
  { to: "/portail-client/signatures", label: "Factures & signatures", icon: FileCheck2 },
  { to: "/portail-client/notifications", label: "Notifications", icon: Bell },
];

const ADMIN_NAV: NavEntry[] = [
  { to: "/admin",              label: "Vue direction",   icon: Shield, exact: true },
  { to: "/admin/enterprises",  label: "Entreprises",     icon: Building2 },
  { to: "/admin/avocats",      label: "Avocats",         icon: Users },
  { to: "/admin/cabinets",     label: "Cabinets",        icon: Building2 },
  { to: "/admin/examens",      label: "Examens",         icon: GraduationCap },
  { to: "/admin/formations",   label: "Formations",      icon: GraduationCap },
  { to: "/admin/actualites",   label: "Actualités",      icon: Newspaper },
  { to: "/admin/bibliotheque", label: "Bibliothèque",    icon: BookOpen },
  { to: "/admin/contenus",     label: "Contenus du site",icon: Settings },
  { to: "/admin/demandes",     label: "Demandes de contact", icon: Inbox },
  { to: "/admin/roles",        label: "Rôles & accès",   icon: Shield },
  { to: "/admin/journal",      label: "Journal d'audit", icon: ScrollText },
  { to: "/admin/discipline",   label: "Discipline",      icon: Scale },
  { to: "/admin/sauvegardes",  label: "Sauvegardes",     icon: Settings },
];

const MODULE_ICONS: Record<string, typeof Shield> = {
  Gauge,
  FolderOpen,
  Users,
  FileText,
  FileStack,
  ScrollText,
  Receipt,
  FileCheck2,
  MessageSquare,
  CalendarDays,
  CheckSquare,
  BookOpen,
  GraduationCap,
  Scale,
  DollarSign,
};

export function AppSidebar({ variant = "staff", clientName }: { variant?: "staff" | "client"; clientName?: string }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const locationSearch = useRouterState({ select: (s) => s.location.search as Record<string, unknown> });
  const isAdmin = useIsBatonnier();
  const { activeEnterprise, navModules } = useEnterpriseWorkspace();

  const primaryNav: NavEntry[] = variant === "client" ? [...CLIENT_NAV] : [];
  const seenRoutes = new Set<string>();
  if (variant === "staff") {
    for (const mod of navModules as any[]) {
      if (!mod.route_path || seenRoutes.has(mod.route_path)) continue;
      seenRoutes.add(mod.route_path);
      const icon = MODULE_ICONS[mod.icon_name as string] ?? Gauge;
      primaryNav.push({ to: mod.route_path, label: mod.label, icon, exact: mod.route_path === "/tableau-de-bord" });
    }
  }

  const hasLawyerGrade = (activeEnterprise?.grade_names ?? []).some((name: string) => {
    const normalized = String(name ?? "").toLowerCase();
    return normalized === "avocat" || normalized === "lawyer";
  });

  if (variant === "staff" && hasLawyerGrade && !seenRoutes.has("/espace-avocat")) {
    primaryNav.push({ to: "/espace-avocat", label: "Espace Avocat", icon: Scale });
  }

  if (variant === "staff" && primaryNav.length === 0) {
    primaryNav.push({ to: "/espace-avocat", label: "Mon espace", icon: Gauge });
  }

  const isActive = (to: string, exact?: boolean) => {
    const routePath = to.split("?")[0];
    const isMessagingView = parseBooleanSearchParam(locationSearch.messagerie);
    if (to.includes("messagerie=1")) return pathname === routePath && isMessagingView;
    const matchesPath = exact ? pathname === routePath : pathname === routePath || pathname.startsWith(routePath + "/");
    return matchesPath && !(routePath === "/dossiers" && isMessagingView);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-2 px-2 py-1.5">
          <img src={seal} alt="Sceau Mercer & Stellaria" className="h-8 w-8 shrink-0" />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate font-display text-sm font-bold text-sidebar-foreground">Mercer & Stellaria</div>
              <div className="truncate text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/60">Corporation</div>
            </div>
          )}
        </Link>
        {variant === "staff" ? (
          <EnterpriseSwitcher />
        ) : !collapsed ? (
          <div className="mx-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.14em] text-sidebar-foreground/50">Espace client</p>
            <p className="mt-0.5 truncate text-xs font-medium text-sidebar-foreground">{clientName || "Client"}</p>
          </div>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{variant === "client" ? "Mon espace" : activeEnterprise?.name ?? "Entreprise"}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primaryNav.map((n) => (
                <SidebarMenuItem key={n.to}>
                  <SidebarMenuButton asChild isActive={isActive(n.to, n.exact)} tooltip={n.label}>
                    <Link
                      to={n.to.split("?")[0]}
                      search={n.to.includes("messagerie=1") ? { messagerie: true } : {}}
                    >
                      <n.icon className="h-4 w-4" />
                      <span>{n.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {variant === "staff" && isAdmin && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Administration</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {ADMIN_NAV.map((n) => (
                    <SidebarMenuItem key={n.to}>
                      <SidebarMenuButton asChild isActive={isActive(n.to, n.exact)} tooltip={n.label}>
                        <Link to={n.to}>
                          <n.icon className="h-4 w-4" />
                          <span>{n.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Site public</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Accueil public">
                  <Link to="/">
                    <Home className="h-4 w-4" />
                    <span>Retour au site</span>
                    <ChevronRight className="ml-auto h-3 w-3 opacity-50" />
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.15em] text-sidebar-foreground/50">
          {collapsed ? "MS" : variant === "client" ? "Accès client sécurisé" : "Plateforme officielle"}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
