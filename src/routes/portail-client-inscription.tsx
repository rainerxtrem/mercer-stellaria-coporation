import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/portail-client-inscription")({
  head: () => ({
    meta: [{ title: "Inscription client - Portail Discord" }],
  }),
  component: ClientPortalOnboardingPage,
});

function ClientPortalOnboardingPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [uniqueId, setUniqueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/discord/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          birth_date: birthDate,
          unique_id: uniqueId,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; session?: unknown; redirectTo?: string }
        | null;

      if (!response.ok || !payload?.ok || !payload.session) {
        setError(payload?.message ?? "Inscription impossible. Vérifiez vos informations.");
        return;
      }

      localStorage.setItem("sba.auth.session", JSON.stringify(payload.session));
      window.location.replace(payload.redirectTo || "/portail-client");
    } catch {
      setError("Inscription impossible pour le moment. Réessayez.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,rgba(212,175,55,0.16),transparent_40%),linear-gradient(180deg,#090f1b_0%,#060912_100%)] px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <Card className="border-zinc-800 bg-zinc-950/75 shadow-2xl">
          <CardContent className="p-8">
            <p className="text-xs uppercase tracking-[0.24em] text-amber-300/90">Portail client Discord</p>
            <h1 className="mt-3 font-display text-3xl font-semibold text-zinc-50">Finaliser votre inscription</h1>
            <p className="mt-3 text-sm leading-relaxed text-zinc-300">
              Votre compte Discord est valide. Renseignez vos informations pour activer votre accès client.
            </p>

            <form className="mt-6 grid gap-4" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="first_name">Prénom</Label>
                <Input
                  id="first_name"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Prénom"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="last_name">Nom</Label>
                <Input
                  id="last_name"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Nom"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="birth_date">Date de naissance</Label>
                <Input
                  id="birth_date"
                  required
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="unique_id">ID unique</Label>
                <Input
                  id="unique_id"
                  required
                  value={uniqueId}
                  onChange={(e) => setUniqueId(e.target.value)}
                  placeholder="Identifiant client"
                />
              </div>

              {error && <p className="rounded-md border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p>}

              <Button
                type="submit"
                disabled={loading}
                className="h-11 bg-amber-500 text-zinc-950 hover:bg-amber-400 disabled:opacity-70"
              >
                {loading ? "Activation en cours..." : "Activer mon accès"}
              </Button>
            </form>

            <p className="mt-6 text-xs text-zinc-400">
              Vous n’avez pas encore d’ID unique ? <Link to="/contact" className="text-amber-300 underline">Contactez votre cabinet</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
