import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";

import { ClientPortalShell } from "@/components/client/ClientPortalShell";
import { supabase } from "@/integrations/supabase/client";

const CLIENT_AUTH_PATH = "/portail-client/auth";

async function hasClientRole(userId: string) {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) return false;
  const roles = (data ?? []).map((row) => String(row.role));
  return roles.includes("client");
}

export const Route = createFileRoute("/portail-client")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const pathname = location.pathname;
    const onAuthPage = pathname === CLIENT_AUTH_PATH;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      if (onAuthPage) return;
      throw redirect({
        to: CLIENT_AUTH_PATH,
        search: { redirect: pathname },
      });
    }

    const allowed = await hasClientRole(data.user.id);
    if (!allowed) {
      throw redirect({ to: "/auth" });
    }

    if (onAuthPage) {
      throw redirect({ to: "/portail-client" });
    }

    return { user: data.user };
  },
  component: PortalClientRoot,
});

function PortalClientRoot() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === CLIENT_AUTH_PATH) return <Outlet />;
  return (
    <ClientPortalShell>
      <Outlet />
    </ClientPortalShell>
  );
}
