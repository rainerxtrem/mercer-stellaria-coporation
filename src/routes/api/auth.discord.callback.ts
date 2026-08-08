import { createFileRoute } from "@tanstack/react-router";

import {
  assertDiscordGuildMembership,
  exchangeDiscordCode,
  getDiscordUser,
  hasDiscordAllAccessRole,
  listDiscordGuildMemberRoleNames,
} from "@/backend/auth/discord";
import {
  DISCORD_ONBOARDING_COOKIE,
  encodeOnboardingContext,
  expireCookie,
  readCookie,
  sanitizeRedirect,
  makeCookie,
} from "@/backend/auth/discord-onboarding";
import { issueSessionForUserId } from "@/backend/auth/service";
import { withSession } from "@/backend/db/execute";

const OAUTH_COOKIE = "sba_discord_oauth_callback";
const LEGACY_STATE_COOKIE = "sba_discord_oauth_state";
const LEGACY_REDIRECT_COOKIE = "sba_discord_oauth_redirect";
const LEGACY_CALLBACK_COOKIE = "sba_discord_oauth_callback_uri";
const DISCORD_MANAGED_SITE_ROLES = [
  "batonnier",
  "responsable_cabinet",
  "avocat",
  "assistant",
  "formateur",
  "examinateur",
];
const DISCORD_MANAGED_GRADE_CODES = ["manager", "lawyer", "assistant", "trainer", "examiner"];

async function syncSiteRolesFromDiscord(userId: string, discordUserId: string): Promise<void> {
  const roleNames = await listDiscordGuildMemberRoleNames(discordUserId);
  if (roleNames === null) return;
  const hasAllAccess = hasDiscordAllAccessRole(roleNames);

  await withSession({ role: "service", claims: null }, async (client) => {
    if (hasAllAccess) {
      await client.query(
        `INSERT INTO public.user_roles (user_id, role)
         SELECT $1, role::public.app_role FROM unnest($2::text[]) AS role
         ON CONFLICT (user_id, role) DO NOTHING`,
        [userId, DISCORD_MANAGED_SITE_ROLES],
      );
      await client.query(
        `INSERT INTO public.enterprise_member_grades (membership_id, grade_id)
         SELECT membership.id, grade.id
           FROM public.enterprise_memberships membership
           JOIN public.enterprise_grades grade
             ON grade.firm_id = membership.firm_id
            AND grade.code = ANY($2::text[])
          WHERE membership.user_id = $1
            AND membership.status = 'active'
         ON CONFLICT (membership_id, grade_id) DO NOTHING`,
        [userId, DISCORD_MANAGED_GRADE_CODES],
      );
      return;
    }

    await client.query(
      `DELETE FROM public.enterprise_member_grades member_grade
       USING public.enterprise_memberships membership, public.enterprise_grades grade
       WHERE member_grade.membership_id = membership.id
         AND member_grade.grade_id = grade.id
         AND membership.user_id = $1
         AND grade.code = ANY($2::text[])`,
      [userId, DISCORD_MANAGED_GRADE_CODES],
    );
    await client.query(
      `DELETE FROM public.user_roles
        WHERE user_id = $1
          AND role::text = ANY($2::text[])`,
      [userId, DISCORD_MANAGED_SITE_ROLES],
    );
  });
}

async function ensureClientEnterpriseGrades(userId: string): Promise<void> {
  await withSession({ role: "service", claims: null }, async (client) => {
    await client.query(
      `INSERT INTO public.enterprise_member_grades (membership_id, grade_id)
       SELECT membership.id, grade.id
         FROM public.enterprise_memberships membership
         JOIN public.enterprise_grades grade ON grade.firm_id = membership.firm_id AND grade.code = 'client'
        WHERE membership.user_id = $1 AND membership.status = 'active'
       ON CONFLICT (membership_id, grade_id) DO NOTHING`,
      [userId],
    );
  });
}

function decodeOAuthContext(value: string | null): {
  state: string;
  redirectTo: string;
  callbackUri: string;
} | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      state?: unknown;
      redirectTo?: unknown;
      callbackUri?: unknown;
    };
    if (
      typeof parsed.state === "string" &&
      typeof parsed.redirectTo === "string" &&
      typeof parsed.callbackUri === "string"
    ) {
      return {
        state: parsed.state,
        redirectTo: parsed.redirectTo,
        callbackUri: parsed.callbackUri,
      };
    }
    return null;
  } catch {
    return null;
  }
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
        const rawOAuthCookie = readCookie(request, OAUTH_COOKIE);
        const contextCookie = decodeOAuthContext(rawOAuthCookie);
        const legacyStateCookie = readCookie(request, LEGACY_STATE_COOKIE);
        const legacyRedirectCookie = readCookie(request, LEGACY_REDIRECT_COOKIE);
        const legacyCallbackCookie = readCookie(request, LEGACY_CALLBACK_COOKIE);
        const url = new URL(request.url);
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        const headers = new Headers({ "content-type": "text/html; charset=utf-8" });
        headers.append("Set-Cookie", expireCookie(OAUTH_COOKIE));
        headers.append("Set-Cookie", expireCookie(LEGACY_STATE_COOKIE));
        headers.append("Set-Cookie", expireCookie(LEGACY_REDIRECT_COOKIE));
        headers.append("Set-Cookie", expireCookie(LEGACY_CALLBACK_COOKIE));

        const expectedState = contextCookie?.state ?? legacyStateCookie;
        const redirectTo = sanitizeRedirect(contextCookie?.redirectTo ?? legacyRedirectCookie ?? "/portail-client");
        const callbackUri = (
          contextCookie?.callbackUri ??
          legacyCallbackCookie ??
          (rawOAuthCookie?.startsWith("http") ? rawOAuthCookie : null) ??
          `${url.origin}/api/auth/discord/callback`
        ).trim();

        if (!state || !expectedState || state !== expectedState) {
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

          if (!linked || !linked.firm_id) {
            const onboarding = encodeOnboardingContext({
              discordUserId: discordUser.id,
              discordUsername: discordUser.global_name ?? discordUser.username,
              discordEmail: discordUser.email ?? null,
              redirectTo,
            });

            const redirectHeaders = new Headers({ Location: "/portail-client-inscription" });
            redirectHeaders.append("Set-Cookie", expireCookie(OAUTH_COOKIE));
            redirectHeaders.append("Set-Cookie", expireCookie(LEGACY_STATE_COOKIE));
            redirectHeaders.append("Set-Cookie", expireCookie(LEGACY_REDIRECT_COOKIE));
            redirectHeaders.append("Set-Cookie", expireCookie(LEGACY_CALLBACK_COOKIE));
            redirectHeaders.append("Set-Cookie", makeCookie(DISCORD_ONBOARDING_COOKIE, onboarding, 900));
            return new Response(null, { status: 302, headers: redirectHeaders });
          }

          if (!linked.profile_id) {
            return new Response(
              renderErrorPage(
                "Ce client existe mais n'a pas encore de compte. Terminez l'inscription client.",
              ).body,
              { status: 403, headers },
            );
          }

          await syncSiteRolesFromDiscord(linked.profile_id, discordUser.id);

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

          await ensureClientEnterpriseGrades(linked.profile_id);

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
