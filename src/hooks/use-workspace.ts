import { useEffect, useMemo, useState } from "react";
import { useEffectiveRoles, type AppRole } from "@/lib/auth";

export type WorkspaceId =
  | "avocat"
  | "cabinet"
  | "assistant"
  | "batonnier"
  | "citoyen"
  | "formateur"
  | "examinateur";

export type WorkspaceOption = {
  id: WorkspaceId;
  label: string;
  description: string;
};

const STORAGE_KEY = "sba.workspace";
const WORKSPACE_EVENT = "sba:workspace-changed";

let activeWorkspace: WorkspaceId | null = null;
const listeners = new Set<() => void>();

function notifyWorkspaceChange() {
  listeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WORKSPACE_EVENT));
  }
}

function readSavedWorkspace(): WorkspaceId | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY) as WorkspaceId | null;
}

function resolveWorkspace(options: WorkspaceOption[]): WorkspaceId {
  const fallback = options[0]?.id ?? "citoyen";
  const current = activeWorkspace ?? readSavedWorkspace();
  if (current && options.some((o) => o.id === current)) return current;
  return fallback;
}

function persistWorkspace(id: WorkspaceId) {
  activeWorkspace = id;
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, id);
  notifyWorkspaceChange();
}

function subscribeWorkspace(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      activeWorkspace = event.newValue as WorkspaceId | null;
      listener();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

function availableWorkspaces(roles: AppRole[]): WorkspaceOption[] {
  const options: WorkspaceOption[] = [];
  if (roles.includes("batonnier")) {
    options.push({ id: "batonnier", label: "Administration Corporate", description: "Administration du Barreau" });
  }
  if (roles.includes("avocat") || roles.includes("batonnier")) {
    options.push({ id: "avocat", label: "Espace Avocat", description: "Dossiers, clients, facturation" });
  }
  if (roles.includes("responsable_cabinet")) {
    options.push({ id: "cabinet", label: "Direction de cabinet", description: "Pilotage du cabinet" });
  }
  if (roles.includes("assistant")) {
    options.push({ id: "assistant", label: "Espace Assistant", description: "Dossiers partagés & tâches" });
  }
  if (roles.includes("formateur") || roles.includes("batonnier")) {
    options.push({ id: "formateur", label: "Espace Formateur", description: "Créer & suivre les formations" });
  }
  if (roles.includes("examinateur") || roles.includes("batonnier")) {
    options.push({ id: "examinateur", label: "Espace Examinateur", description: "Examens & corrections" });
  }
  if (options.length === 0) {
    options.push({ id: "citoyen", label: "Mon espace", description: "Examens & formations" });
  }
  return options;
}

export function useWorkspace() {
  const roles = useEffectiveRoles();
  const options = useMemo(() => availableWorkspaces(roles), [roles.join("|")]);
  const [version, setVersion] = useState(0);
  const active = resolveWorkspace(options);

  useEffect(() => {
    return subscribeWorkspace(() => setVersion((v) => v + 1));
  }, []);

  useEffect(() => {
    const resolved = resolveWorkspace(options);
    if (activeWorkspace !== resolved) {
      activeWorkspace = resolved;
      if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, resolved);
    }
  }, [options, version]);

  function change(id: WorkspaceId) {
    if (!options.some((o) => o.id === id)) return;
    persistWorkspace(id);
  }

  return { active, options, setActive: change, roles };
}
