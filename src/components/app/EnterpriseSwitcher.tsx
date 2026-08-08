import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useEnterpriseWorkspace } from "@/hooks/use-enterprise-workspace";

export function EnterpriseSwitcher() {
  const { state } = useSidebar();
  const navigate = useNavigate();
  const collapsed = state === "collapsed";
  const { enterprises, activeFirmId, activeEnterprise, setActiveEnterprise } = useEnterpriseWorkspace();

  if (enterprises.length <= 1) return null;

  function choose(firmId: string) {
    setActiveEnterprise(firmId);
    navigate({ to: "/tableau-de-bord" });
  }

  return (
    <div className="px-2 pt-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between gap-2 border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Changer d'entreprise"
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0 text-gold" />
              {!collapsed && <span className="truncate text-xs font-medium">{activeEnterprise?.name ?? "Entreprise"}</span>}
            </span>
            {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-1">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Entreprises accessibles
          </div>
          {enterprises.map((enterprise: any) => (
            <Button
              key={enterprise.firm_id}
              type="button"
              variant="ghost"
              onClick={() => choose(enterprise.firm_id)}
              className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
            >
              <div className="mt-0.5 h-4 w-4 shrink-0">
                {enterprise.firm_id === activeFirmId && <Check className="h-4 w-4 text-gold" />}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{enterprise.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {enterprise.number || "Entreprise"}
                </div>
              </div>
            </Button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
