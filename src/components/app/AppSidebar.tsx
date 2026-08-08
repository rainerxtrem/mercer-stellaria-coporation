import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import {
  Gauge, FolderOpen, Users, FileText, User as UserIcon,
  Shield, Building2, Newspaper, BookOpen, ScrollText, Settings,
  ChevronRight, GraduationCap, Home, Inbox, CheckSquare, Scale, DollarSign, FileStack,
} from "lucide-react";
import seal from "@/assets/seal.png";
import { useIsBatonnier } from "@/lib/auth";
import { useWorkspace, type WorkspaceId } from "@/hooks/use-workspace";
import { WorkspaceSwitcher } from "@/components/app/WorkspaceSwitcher";

type NavEntry = { to: string; label: string; icon: typeof Shield; exact?: boolean };

const CITOYEN_NAV: NavEntry[] = [
  { to: "/espace-avocat", label: "Mon espace", icon: UserIcon },
  { to: "/examens",       label: "Examens",    icon: GraduationCap },
  { to: "/formations",    label: "Formations", icon: GraduationCap },
];

const AVOCAT_NAV: NavEntry[] = [
  { to: "/tableau-de-bord", label: "Tableau de bord", icon: Gauge },
  { to: "/dossiers",         label: "Dossiers",       icon: FolderOpen },
  { to: "/taches",           label: "Tâches",         icon: CheckSquare },
  { to: "/clients",          label: "Clients",        icon: Users },
  { to: "/facturation",      label: "Facturation",    icon: FileText },
  { to: "/cabinet/modeles",  label: "Générateur de documents", icon: FileStack },
  { to: "/formations",       label: "Formations",     icon: GraduationCap },
  { to: "/bibliotheque",     label: "Bibliothèque",   icon: BookOpen },
  { to: "/examens",          label: "Examen Barreau", icon: GraduationCap },
  { to: "/mes-dossiers-disciplinaires", label: "Disciplinaire", icon: Scale },
  { to: "/espace-avocat",    label: "Mon espace",     icon: UserIcon },
];

const ASSISTANT_NAV: NavEntry[] = [
  { to: "/dossiers",       label: "Dossiers partagés", icon: FolderOpen },
  { to: "/taches",         label: "Mes tâches",         icon: CheckSquare },
  { to: "/bibliotheque",   label: "Bibliothèque",       icon: BookOpen },
  { to: "/espace-avocat",  label: "Mon espace",         icon: UserIcon },
];

const CABINET_NAV: NavEntry[] = [
  { to: "/cabinet",             label: "Tableau de bord", icon: Gauge, exact: true },
  { to: "/cabinet/membres",     label: "Membres",           icon: Users },
  { to: "/cabinet/dossiers",    label: "Dossiers",          icon: FolderOpen },
  { to: "/cabinet/facturation", label: "Facturation",       icon: FileText },
  { to: "/cabinet/tarifs",      label: "Grille tarifaire",  icon: DollarSign },
  { to: "/cabinet/modeles",     label: "Modèles documentaires", icon: FileStack },

  { to: "/cabinet/formations",  label: "Formations",        icon: GraduationCap },
  { to: "/cabinet/parametres",  label: "Paramètres",        icon: Settings },
  { to: "/espace-avocat",       label: "Mon espace",        icon: UserIcon },
];

const ADMIN_NAV: NavEntry[] = [
  { to: "/admin",              label: "Vue direction",   icon: Shield, exact: true },
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

const FORMATEUR_NAV: NavEntry[] = [
  { to: "/formateur",           label: "Tableau de bord",   icon: Gauge, exact: true },
  { to: "/admin/formations",    label: "Gérer les formations", icon: GraduationCap },
  { to: "/formations",          label: "Catalogue public",  icon: BookOpen },
  { to: "/espace-avocat",       label: "Mon espace",        icon: UserIcon },
];

const EXAMINATEUR_NAV: NavEntry[] = [
  { to: "/examinateur",         label: "Tableau de bord",   icon: Gauge, exact: true },
  { to: "/admin/examens",       label: "Gérer les examens", icon: GraduationCap },
  { to: "/examens",             label: "Catalogue public",  icon: GraduationCap },
  { to: "/espace-avocat",       label: "Mon espace",        icon: UserIcon },
];

const WORKSPACE_NAV: Record<WorkspaceId, { label: string; nav: NavEntry[] }> = {
  batonnier:   { label: "Administration Corporate", nav: AVOCAT_NAV },
  avocat:      { label: "Espace Avocat", nav: AVOCAT_NAV },
  cabinet:     { label: "Direction de cabinet", nav: CABINET_NAV },
  assistant:   { label: "Espace Assistant", nav: ASSISTANT_NAV },
  citoyen:     { label: "Mon espace", nav: CITOYEN_NAV },
  formateur:   { label: "Espace Formateur", nav: FORMATEUR_NAV },
  examinateur: { label: "Espace Examinateur", nav: EXAMINATEUR_NAV },
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsBatonnier();
  const { active } = useWorkspace();
  const primary = WORKSPACE_NAV[active];

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

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
        <WorkspaceSwitcher />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{primary.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {primary.nav.map((n) => (
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

        {isAdmin && active === "batonnier" && (
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
          {collapsed ? "SBA" : "Plateforme officielle"}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
