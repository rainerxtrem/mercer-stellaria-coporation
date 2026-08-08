import { type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

import { NotificationsBell } from "@/components/site/NotificationsBell";
import { GlobalSearch } from "@/components/site/GlobalSearch";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSession, useIsBatonnier, signOut } from "@/lib/auth";
import { LogOut, User as UserIcon, Shield, ExternalLink } from "lucide-react";

export function AppShell({ children }: { children: ReactNode }) {
  const session = useSession();
  const isAdmin = useIsBatonnier();
  const navigate = useNavigate();
  const email = session?.user.email ?? "";
  const initials = (email.split("@")[0] ?? "?").slice(0, 2).toUpperCase();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-surface-2">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <div className="flex flex-1 items-center gap-2">
            <GlobalSearch />
          </div>
          <div className="flex items-center gap-1">
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 pl-2 pr-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-navy text-[10px] font-bold text-white">
                    {initials}
                  </span>
                  <span className="hidden md:inline max-w-[140px] truncate">{email.split("@")[0]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold">{email.split("@")[0]}</span>
                    <span className="truncate text-xs text-muted-foreground">{email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/espace-avocat" })}>
                  <UserIcon className="mr-2 h-4 w-4" /> Mon espace
                </DropdownMenuItem>
                {isAdmin && (
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
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
