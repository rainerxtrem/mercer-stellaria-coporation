import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, FolderOpen, Users, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command";
import { globalSearch } from "@/lib/dashboard.functions";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const searchFn = useServerFn(globalSearch);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: open && q.trim().length >= 2,
    staleTime: 15_000,
  });

  const go = (to: string, params?: any) => {
    setOpen(false); setQ("");
    navigate({ to, params } as any);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="hidden md:inline-flex gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
        aria-label="Recherche globale"
      >
        <Search className="h-4 w-4" />
        <span>Rechercher…</span>
        <kbd className="ml-2 rounded border border-border bg-secondary px-1.5 text-[10px]">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Chercher un dossier, client, facture…" value={q} onValueChange={setQ} />
        <CommandList>
          {q.trim().length < 2 ? (
            <CommandEmpty>Tapez au moins 2 caractères.</CommandEmpty>
          ) : isFetching ? (
            <CommandEmpty>Recherche…</CommandEmpty>
          ) : (
            <>
              {(!data || (data.matters.length + data.clients.length + data.invoices.length) === 0) && (
                <CommandEmpty>Aucun résultat.</CommandEmpty>
              )}
              {data && data.matters.length > 0 && (
                <CommandGroup heading="Dossiers">
                  {data.matters.map((m: any) => (
                    <CommandItem
                      key={m.id}
                      value={`matter-${m.id}-${m.title}`}
                      onSelect={() => go("/dossiers/$matterId", { matterId: m.id })}
                    >
                      <FolderOpen className="mr-2 h-4 w-4" />
                      <span className="font-medium">{m.title}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{m.number}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
              {data && data.clients.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Clients">
                    {data.clients.map((c: any) => (
                      <CommandItem
                        key={c.id}
                        value={`client-${c.id}-${c.first_name}-${c.last_name}`}
                        onSelect={() => go("/clients")}
                      >
                        <Users className="mr-2 h-4 w-4" />
                        <span>{c.first_name} {c.last_name}</span>
                        {c.email && <span className="ml-2 text-xs text-muted-foreground">{c.email}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
              {data && data.invoices.length > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Facturation">
                    {data.invoices.map((i: any) => (
                      <CommandItem
                        key={i.id}
                        value={`invoice-${i.id}-${i.number}`}
                        onSelect={() => go("/facturation/$id", { id: i.id })}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        <span className="font-mono">{i.number}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {i.kind === "quote" ? "Devis" : "Facture"} · {i.status}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
