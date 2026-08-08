import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck, MessageSquareShare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/portail-client/auth")({
  head: () => ({
    meta: [{ title: "Portail client securise - Connexion Discord" }],
  }),
  component: ClientPortalAuthPage,
});

function ClientPortalAuthPage() {
  const discordStart = "/api/auth/discord/start?redirect_to=/portail-client";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_10%_10%,rgba(212,175,55,0.15),transparent_40%),linear-gradient(180deg,#090f1b_0%,#060912_100%)] px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
          <Card className="border-zinc-800 bg-zinc-950/70 shadow-2xl">
            <CardContent className="p-8">
              <p className="text-xs uppercase tracking-[0.24em] text-amber-300/90">Mercer & Stellaria</p>
              <h1 className="mt-3 font-display text-3xl font-semibold text-zinc-50">Portail Client Isole</h1>
              <p className="mt-3 max-w-prose text-sm leading-relaxed text-zinc-300">
                Cet espace est reserve aux clients verifies et relies a un compte Discord autorise.
                La connexion par e-mail et mot de passe est volontairement desactivee.
              </p>
              <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                <p className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  Votre compte Discord doit etre membre du serveur officiel et deja rattache a votre fiche client.
                </p>
              </div>
              <div className="mt-6">
                <Button
                  className="h-11 bg-amber-500 text-zinc-950 hover:bg-amber-400"
                  onClick={() => {
                    window.location.href = discordStart;
                  }}
                >
                  <MessageSquareShare className="mr-2 h-4 w-4" />Se connecter avec Discord
                </Button>
              </div>
              <p className="mt-6 text-xs text-zinc-400">
                Compte non reconnu ? Contactez votre cabinet via le formulaire public.
              </p>
              <p className="mt-2 text-xs text-zinc-400">
                <Link to="/contact" className="text-amber-300 underline">Contacter le cabinet</Link>
              </p>
            </CardContent>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60">
            <CardContent className="p-6 text-sm text-zinc-300">
              <h2 className="font-display text-lg text-zinc-100">Ce que vous pouvez faire</h2>
              <ul className="mt-4 space-y-2">
                <li>Suivre vos dossiers en temps reel.</li>
                <li>Recevoir et telecharger les documents partages.</li>
                <li>Echanger avec votre entreprise sur les dossiers et la conversation generale.</li>
                <li>Signer ou refuser les devis/factures securises.</li>
                <li>Recevoir des notifications Discord sans contenu confidentiel.</li>
              </ul>
              <div className="mt-6 border-t border-zinc-800 pt-4 text-xs text-zinc-400">
                <Link to="/" className="underline">Retour au site public</Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
