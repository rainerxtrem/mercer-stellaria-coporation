import { createFileRoute } from "@tanstack/react-router";

import {
  assertDiscordGuildMembership,
  exchangeDiscordCode,
  getDiscordUser,
} from "@/backend/auth/discord";
import { issueSessionForUserId } from "@/backend/auth/service";
import { withSession } from "@/backend/db/execute";

const STATE_COOKIE = "sba_discord_oauth_state";
const REDIRECT_COOKIE = "sba_discord_oauth_redirect";
const CALLBACK_COOKIE = "sba_discord_oauth_callback";
const PRIVILEGED_ROLES = new Set([
  "batonnier",
  "avocat",
  "responsable_cabinet",
  "assistant",
  "formateur",
  "examinateur",
]);

function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const chunks = raw.split(";");
  for (const chunk of chunks) {
    const [key, ...rest] = chunk.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function expireCookie(name: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function sanitizeRedirect(value: string | null): string {
  if (!value) return "/portail-client";
  if (!value.startsWith("/")) return "/portail-client";
  if (value.startsWith("//")) return "/portail-client";
  return value;
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderErrorPage(message: string): Response {
  const body = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Discord login failed</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;background:#0b111b;color:#e5e7eb;">
  <h1 style="margin:0 0 8px;">Connexion Discord impossible</h1>
  <p style="margin:0 0 16px;color:#9ca3af;">${htmlEscape(message)}</p>
  <a href="/portail-client/auth" style="color:#d4af37;">Retour au portail client</a>
</body></html>`;
  return new Response(body, {
    status: 400,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/auth/discord/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const stateCookie = readCookie(request, STATE_COOKIE);
        const redirectCookie = readCookie(request, REDIRECT_COOKIE);
        const callbackCookie = readCookie(request, CALLBACK_COOKIE);
        const url = new URL(request.url);
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
        headers.append("Set-Cookie", expireCookie(STATE_COOKIE));
        headers.append("Set-Cookie", expireCookie(REDIRECT_COOKIE));
        headers.append("Set-Cookie", expireCookie(CALLBACK_COOKIE));

        if (!state || !stateCookie || state !== stateCookie) {
          return new Response(renderErrorPage("Etat OAuth invalide, veuillez recommencer.").body, {
            status: 400,
            headers,
          });
        }
        if (!code) {
          return new Response(renderErrorPage("Code OAuth manquant.").body, {
            status: 400,
            headers,
          });
        }

        try {
          const callbackUri = callbackCookie?.trim() || `${url.origin}/api/auth/discord/callback`;
          const token = await exchangeDiscordCode(code, callbackUri);
          await assertDiscordGuildMembership(token.access_token);
          const discordUser = await getDiscordUser(token.access_token);

          const linked = await withSession({ role: "service", claims: null }, async (client) => {
            const { rows } = await client.query<{
              id: string;
              profile_id: string | null;
              firm_id: string | null;
            }>(
              `SELECT id, profile_id, firm_id
                 FROM public.clients
                WHERE discord_user_id = $1
                LIMIT 1`,
              [discordUser.id],
            );
            return rows[0] ?? null;
          });

          if (!linked || !linked.profile_id || !linked.firm_id) {
            return new Response(
              renderErrorPage(
                "Ce compte Discord n'est pas lie a un client actif. Contactez votre entreprise.",
              ).body,
              { status: 403, headers },
            );
          }

          const roles = await withSession({ role: "service", claims: null }, async (client) => {
            const { rows } = await client.query<{ role: string }>(
              `SELECT role::text FROM public.user_roles WHERE user_id = $1`,
              [linked.profile_id],
            );
            return rows.map((row) => row.role);
          });

          if (!roles.includes("client")) {
            return new Response(
              renderErrorPage("Ce compte n'a pas les permissions du portail client.").body,
              { status: 403, headers },
            );
          }

          if (roles.some((role) => PRIVILEGED_ROLES.has(role))) {
            return new Response(
              renderErrorPage(
                "Ce compte possede des droits internes et ne peut pas utiliser le portail client isole.",
              ).body,
              { status: 403, headers },
            );
          }

          await withSession({ role: "service", claims: null }, async (client) => {
            await client.query(
              `UPDATE public.clients
                  SET discord_username = $2,
                      updated_at = now()
                WHERE id = $1`,
              [linked.id, discordUser.global_name ?? discordUser.username],
            );
          });

          const session = await issueSessionForUserId(linked.profile_id);
          const redirectTo = sanitizeRedirect(redirectCookie ?? "/portail-client");
          const payload = JSON.stringify(session).replace(/</g, "\\u003c");
          const html = `<!doctype html>
<html><head><meta charset="utf-8" /><title>Connexion...</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;">Connexion en cours...</body>
<script>
  try {
    const session = ${payload};
    localStorage.setItem("sba.auth.session", JSON.stringify(session));
    window.location.replace(${JSON.stringify(redirectTo)});
  } catch (error) {
    window.location.replace("/portail-client/auth?error=oauth_session");
  }
</script></html>`;
          return new Response(html, { status: 200, headers });
        } catch (error) {
          return new Response(
            renderErrorPage((error as Error).message || "Connexion Discord impossible.").body,
            { status: 400, headers },
          );
        }
      },
    },
  },
});
