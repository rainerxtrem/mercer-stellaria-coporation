import { Check, ChevronsUpDown, Layers } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useWorkspace, type WorkspaceId, type WorkspaceOption } from "@/hooks/use-workspace";

function workspaceHome(id: WorkspaceId) {
  switch (id) {
    case "batonnier": return "/admin";
    case "avocat": return "/tableau-de-bord";
    case "cabinet": return "/cabinet";
    case "assistant": return "/dossiers";
    case "formateur": return "/formateur";
    case "examinateur": return "/examinateur";
    case "citoyen": return "/espace-avocat";
  }
}

export function WorkspaceSwitcher() {
  const { active, options, setActive } = useWorkspace();
  const { state } = useSidebar();
  const navigate = useNavigate();
  const collapsed = state === "collapsed";
  const current = options.find((o) => o.id === active) ?? options[0];
  if (!current || options.length <= 1) return null;

  function choose(id: WorkspaceId) {
    setActive(id);
    const target = workspaceHome(id);
    switch (target) {
      case "/admin": navigate({ to: "/admin" }); break;
      case "/tableau-de-bord": navigate({ to: "/tableau-de-bord" }); break;
      case "/cabinet": navigate({ to: "/cabinet" }); break;
      case "/dossiers": navigate({ to: "/dossiers" }); break;
      case "/formateur": navigate({ to: "/formateur" }); break;
      case "/examinateur": navigate({ to: "/examinateur" }); break;
      case "/espace-avocat": navigate({ to: "/espace-avocat" }); break;
    }
  }

  return (
    <div className="px-2 pt-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between gap-2 border-sidebar-border bg-sidebar-accent/30 text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Changer d'espace"
          >
            <span className="flex items-center gap-2 truncate">
              <Layers className="h-4 w-4 shrink-0 text-gold" />
              {!collapsed && <span className="truncate text-xs font-medium">{current.label}</span>}
            </span>
            {!collapsed && <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1">
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Vos espaces
          </div>
          {options.map((o: WorkspaceOption) => (
            <Button
              key={o.id}
              type="button"
              variant="ghost"
              onClick={() => choose(o.id)}
              className="h-auto w-full justify-start gap-2 px-2 py-2 text-left"
            >
              <div className="mt-0.5 h-4 w-4 shrink-0">
                {o.id === active && <Check className="h-4 w-4 text-gold" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{o.label}</div>
                <div className="text-xs text-muted-foreground">{o.description}</div>
              </div>
            </Button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
