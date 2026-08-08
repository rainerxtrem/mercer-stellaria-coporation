import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import seal from "@/assets/seal.png";
import { Loader2, ShieldCheck, MessageSquareShare } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — Mercer & Stellaria Corporation" },
      { name: "description", content: "Accès sécurisé au portail du Mercer & Stellaria Corporation : avocats, cabinets, clients et administration." },
      { property: "og:title", content: "Connexion — Mercer & Stellaria Corporation" },
      { property: "og:description", content: "Portail sécurisé du Mercer & Stellaria Corporation. Les comptes sont créés par la direction ou votre cabinet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const DEFAULT_AUTH_REDIRECT_TARGET = "/espace-avocat";

function getAuthErrorMessage(message: string) {
  if (message === "Invalid login credentials") {
    return "Identifiants invalides. Vérifiez votre adresse e-mail et votre mot de passe, ou utilisez le lien de réinitialisation.";
  }
  if (message === "discord_oauth_required") {
    return "Les comptes clients se connectent uniquement via Discord dans le portail client isole.";
  }
  return message;
}

async function resolveAuthRedirectTarget(userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role as string);
  if (roles.includes("batonnier")) return "/admin";
  return DEFAULT_AUTH_REDIRECT_TARGET;
}


function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handlePasswordResetRequest() {
    const value = email.trim();
    if (!value) {
      toast.error("Saisissez votre adresse e-mail avant de demander un nouveau mot de passe.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(value, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(getAuthErrorMessage(error.message));
    toast.success("Un lien sécurisé de définition du mot de passe vient d’être envoyé.");
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        const target = await resolveAuthRedirectTarget(data.session.user.id);
        navigate({ to: target, replace: true });
      }
    });
  }, [navigate]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value || !password) {
      toast.error("Veuillez saisir votre adresse e-mail et votre mot de passe.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: value, password });
    setLoading(false);
    if (error) return toast.error(getAuthErrorMessage(error.message));
    toast.success("Bienvenue au Mercer & Stellaria Corporation.");
    const target = data.user ? await resolveAuthRedirectTarget(data.user.id) : DEFAULT_AUTH_REDIRECT_TARGET;
    navigate({ to: target, replace: true });
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-secondary/40 py-16">
      <div className="container-page max-w-md">
        <div className="mb-8 text-center">
          <img src={seal} alt="" className="mx-auto h-16 w-16" />
          <h1 className="mt-4 font-display text-2xl font-bold text-navy-deep">Accès sécurisé</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Portail réservé aux membres du Barreau, aux cabinets et à leurs clients.
          </p>
        </div>
        <Card className="shadow-[var(--shadow-card)]">
          <CardContent className="p-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-login">Adresse e-mail</Label>
                <Input id="email-login" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pwd-login">Mot de passe</Label>
                <Input id="pwd-login" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <button
                type="button"
                onClick={handlePasswordResetRequest}
                disabled={loading}
                className="text-left text-xs font-medium text-navy hover:text-navy-deep"
              >
                Définir ou réinitialiser mon mot de passe
              </button>
              <Button type="submit" disabled={loading} className="w-full bg-navy text-white hover:bg-navy-deep">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Se connecter"}
              </Button>
            </form>

            <div className="mt-6 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>
                  En cas de problème de connexion, utilisez le {" "}
                  <Link to="/contact" className="font-medium text-navy underline">formulaire de contact</Link>.
                </span>
              </p>
              <div className="mt-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-gold/40 text-gold hover:bg-gold hover:text-[#0a0e16]"
                  onClick={() => {
                    window.location.href = "/api/auth/discord/start?redirect_to=/portail-client";
                  }}
                >
                  <MessageSquareShare className="mr-2 h-4 w-4" />Se connecter avec Discord (Client)
                </Button>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:text-navy">← Retour au portail public</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
