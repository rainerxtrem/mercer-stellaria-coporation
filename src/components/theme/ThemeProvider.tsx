import { type ReactNode } from "react";

/**
 * Thème sombre unique. Le mode clair a été supprimé.
 * Ce provider est conservé pour compatibilité et applique la classe `dark` à la racine.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
  return <>{children}</>;
}

/** Script inline conservé pour poser la classe `dark` avant hydratation. */
export const themeInitScript = `(function(){try{document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark';}catch(e){}})();`;

/** No-op conservé pour compatibilité — l'application est verrouillée en sombre. */
export function useTheme() {
  return {
    theme: "dark" as const,
    setTheme: (_: "dark") => {},
    toggle: () => {},
  };
}
