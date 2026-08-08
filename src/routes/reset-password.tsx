import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import seal from "@/assets/seal.png";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nouveau mot de passe — Mercer & Stellaria Corporation" }] }),
  component: ResetPasswordPage,
});

function logResetStep(label: string, details: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.info(`[Auth] ${label}`, details);
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      logResetStep("password recovery session", {
        status: error ? "error" : data.session ? "ready" : "missing",
        hasSession: Boolean(data.session),
        userId: data.session?.user.id ?? null,
        email: data.session?.user.email ?? null,
        error,
      });
      setSessionReady(Boolean(data.session));
    });
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    logResetStep("password update request", { status: "pending" });
    const { data, error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    logResetStep("password update response", {
      status: error ? "error" : "success",
      userId: data.user?.id ?? null,
      email: data.user?.email ?? null,
      response: data,
      error,
    });

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mot de passe mis à jour. Vous pouvez vous connecter.");
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-secondary/40 py-16">
      <div className="container-page max-w-md">
        <div className="mb-8 text-center">
          <img src={seal} alt="" className="mx-auto h-16 w-16" />
          <h1 className="mt-4 font-display text-2xl font-bold text-navy-deep">
            Nouveau mot de passe
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Définissez un mot de passe pour accéder au portail sécurisé.
          </p>
        </div>
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-6">
            {!sessionReady && (
              <div className="mb-5 rounded-md border border-gold/50 bg-gold/10 p-3 text-sm text-navy-deep">
                Ouvrez cette page depuis le lien reçu par e-mail pour autoriser la modification du mot de passe.
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nouveau mot de passe</Label>
                <Input id="new-password" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" minLength={6} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <Button type="submit" disabled={loading || !sessionReady} className="w-full bg-navy text-white hover:bg-navy-deep">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enregistrer le mot de passe"}
              </Button>
            </form>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link to="/auth" className="hover:text-navy">← Retour à la connexion</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}