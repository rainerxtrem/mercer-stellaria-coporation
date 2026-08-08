import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

/**
 * Transition premium entre les pages : chaque changement d'URL remonte une clé
 * différente, ce qui rejoue l'animation d'apparition progressive.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const key = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div key={key} className="animate-enter">
      {children}
    </div>
  );
}
