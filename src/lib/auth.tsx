import { useEffect, useState } from "react";
import type { Session } from "@/lib/pgrest/auth-client";
import { supabase } from "@/integrations/supabase/client";
import type { useNavigate } from "@tanstack/react-router";

export type AppRole =
  | "batonnier"
  | "avocat"
  | "client"
  | "citoyen"
  | "assistant"
  | "responsable_cabinet"
  | "formateur"
  | "examinateur";

export const ALL_APP_ROLES: AppRole[] = [
  "batonnier",
  "avocat",
  "client",
  "responsable_cabinet",
  "assistant",
  "formateur",
  "examinateur",
  "citoyen",
];

export const ROLE_LABELS: Record<AppRole, string> = {
  batonnier: "CEO",
  avocat: "Lawyer",
  client: "Client Portal",
  responsable_cabinet: "Managing Partner",
  assistant: "Paralegal",
  formateur: "Training Director",
  examinateur: "Examiner",
  citoyen: "Client",
};

export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return session;
}

export function useMyRoles(): AppRole[] {
  const session = useSession();
  const [roles, setRoles] = useState<AppRole[]>([]);
  useEffect(() => {
    if (!session) {
      setRoles([]);
      return;
    }
    const load = () => {
      void supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .then(({ data }) => setRoles((data ?? []).map((r) => r.role as AppRole)));
    };
    load();
    window.addEventListener("sba:roles-changed", load);
    return () => window.removeEventListener("sba:roles-changed", load);
  }, [session]);
  return roles;
}

/**
 * Effective roles: the CEO inherits every operational role so their
 * portal has the same reach as any other member.
 */
export function useEffectiveRoles(): AppRole[] {
  const raw = useMyRoles();
  if (raw.includes("batonnier")) {
    return Array.from(
      new Set<AppRole>([
        ...raw,
        "avocat",
        "responsable_cabinet",
        "assistant",
        "formateur",
        "examinateur",
        "citoyen",
      ]),
    );
  }
  return raw;
}

export function useHasRole(role: AppRole): boolean {
  return useEffectiveRoles().includes(role);
}

export function useIsBatonnier(): boolean {
  return useMyRoles().includes("batonnier");
}

export async function signOut(navigate: ReturnType<typeof useNavigate>) {
  await supabase.auth.signOut();
  navigate({ to: "/auth", replace: true });
}
