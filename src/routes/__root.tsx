import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Header } from "../components/site/Header";
import { Footer } from "../components/site/Footer";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider, themeInitScript } from "@/components/theme/ThemeProvider";
import { PageTransition } from "@/components/site/PageTransition";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="flex flex-1 items-center justify-center bg-secondary px-4 py-24">
        <div className="max-w-md text-center">
          <h1 className="font-display text-7xl font-bold text-navy-deep">404</h1>
          <h2 className="mt-4 font-display text-xl font-semibold">Page introuvable</h2>
          <p className="mt-2 text-sm text-muted-foreground">La page recherchée n'existe pas ou a été déplacée.</p>
          <div className="mt-6">
            <Link to="/" className="inline-flex items-center justify-center rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-deep">
              Retour à l'accueil
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error("[router] root error boundary", error);
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold text-navy-deep">Erreur de chargement</h1>
        <p className="mt-2 text-sm text-muted-foreground">Une erreur est survenue. Vous pouvez réessayer.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-deep">Réessayer</button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">Accueil</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Mercer & Stellaria Corporation" },
      { name: "description", content: "Mercer & Stellaria Corporation — Sécurisez vos actifs, garantissez vos contrats, défendez vos droits." },
      { name: "author", content: "Mercer & Stellaria Corporation" },
      { property: "og:title", content: "Mercer & Stellaria Corporation" },
      { property: "og:description", content: "Sécurisez vos actifs, garantissez vos contrats, défendez vos droits." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Mercer & Stellaria Corporation" },
      { name: "twitter:description", content: "Sécurisez vos actifs, garantissez vos contrats, défendez vos droits." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/YBWKEqx3lnSlALP477uxPbrvdcz2/social-images/social-1784424522242-IMG_5677.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/YBWKEqx3lnSlALP477uxPbrvdcz2/social-images/social-1784424522242-IMG_5677.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Manrope:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" },
    ],
    scripts: [{ children: themeInitScript }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

/** Routes that render inside the authenticated AppShell (own header + sidebar). */
const APP_SHELL_PREFIXES = [
  "/admin",
  "/tableau-de-bord",
  "/dossiers",
  "/clients",
  "/facturation",
  "/portail-client",
];

function useIsAppShellRoute() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return APP_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const inAppShell = useIsAppShellRoute();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event: string) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {inAppShell ? (
          <PageTransition><Outlet /></PageTransition>
        ) : (
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1"><PageTransition><Outlet /></PageTransition></main>
            <Footer />
          </div>
        )}
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
