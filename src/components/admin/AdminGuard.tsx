import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Sections that non-CEO can enter when they hold the matching role.
const ROLE_SECTIONS: Array<{ prefix: string; role: string }> = [
  { prefix: "/admin/formations", role: "formateur" },
  { prefix: "/admin/examens", role: "examinateur" },
];

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return setState("denied");
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id);
      const roles = (data ?? []).map((r) => r.role as string);
      if (roles.includes("batonnier")) return setState("allowed");
      const allowedByRole = ROLE_SECTIONS.some(
        (s) => pathname.startsWith(s.prefix) && roles.includes(s.role),
      );
      setState(allowedByRole ? "allowed" : "denied");
    })();
  }, [pathname]);

  if (state === "loading") {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-navy" />
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div className="container-page py-24 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-gold" />
        <h1 className="mt-4 font-display text-2xl font-bold text-navy-deep">Accès restreint</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette section est réservée aux membres habilités. Contactez la direction pour obtenir les droits.
        </p>
        <Button asChild className="mt-6 bg-navy text-white">
          <Link to="/">Retour au portail</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
