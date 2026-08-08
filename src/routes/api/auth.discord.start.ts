import { createFileRoute } from "@tanstack/react-router";

import { buildDiscordAuthorizeUrl, getDiscordConfig } from "@/backend/auth/discord";

const OAUTH_COOKIE = "sba_discord_oauth";

function sanitizeRedirect(value: string | null): string {
  if (!value) return "/portail-client";
  if (!value.startsWith("/")) return "/portail-client";
  if (value.startsWith("//")) return "/portail-client";
  return value;
}

function makeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function encodeOAuthContext(payload: { state: string; redirectTo: string; callbackUri: string }): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export const Route = createFileRoute("/api/auth/discord/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const redirectTo = sanitizeRedirect(url.searchParams.get("redirect_to"));
        const cfg = getDiscordConfig();

        const state = crypto.randomUUID();
        const location = buildDiscordAuthorizeUrl(state);
        const context = encodeOAuthContext({
          state,
          redirectTo,
          callbackUri: cfg.redirectUri,
        });

        const headers = new Headers({ Location: location });
        headers.append("Set-Cookie", makeCookie(OAUTH_COOKIE, context, 600));

        return new Response(null, {
          status: 302,
          headers,
        });
      },
    },
  },
});
