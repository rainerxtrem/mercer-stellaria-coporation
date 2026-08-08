import { type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/app/AppShell";
import { getClientProfile } from "@/lib/client-portal.functions";

export function ClientPortalShell({ children }: { children: ReactNode }) {
  const profileFn = useServerFn(getClientProfile);
  const profileQ = useQuery({ queryKey: ["client-portal", "profile", "shell"], queryFn: () => profileFn() });
  const fullName = [profileQ.data?.last_name, profileQ.data?.first_name].filter(Boolean).join(" ");
  const displayName = fullName || (profileQ.isError ? "Profil indisponible" : "Chargement...");
  return <AppShell variant="client" displayName={displayName}>{children}</AppShell>;
}
