import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { listClients } from "@/lib/clients.functions";
import { listMatters } from "@/lib/matters.functions";
import { Check, ChevronsUpDown, Lock, X, User, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerValue = {
  client_id: string | null;
  matter_id: string | null;
};

type Client = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null };
type Matter = { id: string; number: string; title: string; client_id: string | null; clients?: { id: string; first_name: string; last_name: string } | null };

export function ClientMatterPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: PickerValue;
  onChange: (v: PickerValue) => void;
  disabled?: boolean;
}) {
  const listClientsFn = useServerFn(listClients);
  const listMattersFn = useServerFn(listMatters);

  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: () => listClientsFn(), staleTime: 30_000 });
  const mattersQ = useQuery({ queryKey: ["matters", "all"], queryFn: () => listMattersFn({ data: {} }), staleTime: 30_000 });

  const clients = (clientsQ.data ?? []) as Client[];
  const matters = (mattersQ.data ?? []) as Matter[];

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const matterById = useMemo(() => new Map(matters.map((m) => [m.id, m])), [matters]);

  const selectedClient = value.client_id ? clientById.get(value.client_id) : null;
  const selectedMatter = value.matter_id ? matterById.get(value.matter_id) : null;

  const clientLocked = !!selectedMatter?.client_id;

  // Filter matter list: if a client is selected, only show that client's matters
  const filteredMatters = useMemo(() => {
    if (!value.client_id) return matters;
    return matters.filter((m) => m.client_id === value.client_id);
  }, [matters, value.client_id]);

  const [clientOpen, setClientOpen] = useState(false);
  const [matterOpen, setMatterOpen] = useState(false);

  function selectClient(id: string | null) {
    // Changing the client clears any matter that doesn't match
    const currentMatter = id ? matters.find((m) => m.id === value.matter_id) : null;
    const keepMatter = currentMatter && currentMatter.client_id === id;
    onChange({ client_id: id, matter_id: keepMatter ? value.matter_id : null });
    setClientOpen(false);
  }

  function selectMatter(id: string | null) {
    if (!id) {
      onChange({ ...value, matter_id: null });
    } else {
      const m = matterById.get(id);
      // Auto-align client to the matter's client (and lock it)
      onChange({ client_id: m?.client_id ?? value.client_id, matter_id: id });
    }
    setMatterOpen(false);
  }

  return (
    <div className="grid gap-3">
      {/* Client picker */}
      <div>
        <Label className="flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" />
          Client
          {clientLocked && (
            <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" /> verrouillé par le dossier
            </span>
          )}
        </Label>
        <Popover open={clientOpen} onOpenChange={(o) => !disabled && !clientLocked && setClientOpen(o)}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              disabled={disabled || clientLocked}
              className="w-full justify-between font-normal"
            >
              {selectedClient ? (
                <span className="truncate">
                  {selectedClient.last_name.toUpperCase()} {selectedClient.first_name}
                  {selectedClient.email ? <span className="ml-2 text-xs text-muted-foreground">· {selectedClient.email}</span> : null}
                </span>
              ) : (
                <span className="text-muted-foreground">Sélectionner un client existant…</span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command
              filter={(val, search) => {
                // val = combined string we set on each item
                return val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
              }}
            >
              <CommandInput placeholder="Rechercher par nom, prénom, email…" />
              <CommandList>
                <CommandEmpty>Aucun client trouvé.</CommandEmpty>
                <CommandGroup>
                  {clients.map((c) => {
                    const label = `${c.last_name} ${c.first_name} ${c.email ?? ""} ${c.phone ?? ""}`;
                    return (
                      <CommandItem
                        key={c.id}
                        value={label}
                        onSelect={() => selectClient(c.id)}
                      >
                        <Check className={cn("mr-2 h-4 w-4", value.client_id === c.id ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{c.last_name.toUpperCase()} {c.first_name}</div>
                          {c.email && <div className="truncate text-xs text-muted-foreground">{c.email}</div>}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedClient && !clientLocked && !disabled && (
          <button
            type="button"
            onClick={() => selectClient(null)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" /> Retirer le client
          </button>
        )}
      </div>

      {/* Matter picker */}
      <div>
        <Label className="flex items-center gap-1.5">
          <Folder className="h-3.5 w-3.5" />
          Dossier (optionnel)
        </Label>
        <Popover open={matterOpen} onOpenChange={(o) => !disabled && setMatterOpen(o)}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              disabled={disabled}
              className="w-full justify-between font-normal"
            >
              {selectedMatter ? (
                <span className="truncate">
                  <span className="font-mono text-xs text-muted-foreground">{selectedMatter.number}</span>{" "}
                  {selectedMatter.title}
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {value.client_id ? "Sélectionner un dossier de ce client…" : "Sélectionner un dossier existant…"}
                </span>
              )}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command
              filter={(val, search) => (val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0)}
            >
              <CommandInput placeholder="Rechercher par numéro, objet, nom client…" />
              <CommandList>
                <CommandEmpty>
                  {value.client_id ? "Aucun dossier pour ce client." : "Aucun dossier trouvé."}
                </CommandEmpty>
                <CommandGroup>
                  {filteredMatters.map((m) => {
                    const cli = m.clients ? `${m.clients.last_name} ${m.clients.first_name}` : "";
                    const label = `${m.number} ${m.title} ${cli}`;
                    return (
                      <CommandItem
                        key={m.id}
                        value={label}
                        onSelect={() => selectMatter(m.id)}
                      >
                        <Check className={cn("mr-2 h-4 w-4", value.matter_id === m.id ? "opacity-100" : "opacity-0")} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono text-xs text-muted-foreground">{m.number}</span>
                            <span className="truncate font-medium">{m.title}</span>
                          </div>
                          {cli && <div className="truncate text-xs text-muted-foreground">{cli}</div>}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedMatter && !disabled && (
          <button
            type="button"
            onClick={() => selectMatter(null)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
          >
            <X className="h-3 w-3" /> Retirer le dossier
          </button>
        )}
      </div>
    </div>
  );
}
