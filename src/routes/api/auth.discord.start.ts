import { createFileRoute } from "@tanstack/react-router";

import { buildDiscordAuthorizeUrl, getDiscordConfig } from "@/backend/auth/discord";

const STATE_COOKIE = "sba_discord_oauth_state";
const REDIRECT_COOKIE = "sba_discord_oauth_redirect";
const CALLBACK_COOKIE = "sba_discord_oauth_callback";

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

export const Route = createFileRoute("/api/auth/discord/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const redirectTo = sanitizeRedirect(url.searchParams.get("redirect_to"));
        const cfg = getDiscordConfig();

        const state = crypto.randomUUID();
        const location = buildDiscordAuthorizeUrl(state);

        const headers = new Headers({ Location: location });
        headers.append("Set-Cookie", makeCookie(STATE_COOKIE, state, 600));
        headers.append("Set-Cookie", makeCookie(REDIRECT_COOKIE, redirectTo, 600));
        headers.append("Set-Cookie", makeCookie(CALLBACK_COOKIE, cfg.redirectUri, 600));

        return new Response(null, {
          status: 302,
          headers,
        });
      },
    },
  },
});
