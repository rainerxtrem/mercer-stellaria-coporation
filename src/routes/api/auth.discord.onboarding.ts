import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { issueSessionForUserId } from "@/backend/auth/service";
import {
  DISCORD_ONBOARDING_COOKIE,
  decodeOnboardingContext,
  expireCookie,
  readCookie,
  sanitizeRedirect,
} from "@/backend/auth/discord-onboarding";
import { withSession } from "@/backend/db/execute";

const payloadSchema = z.object({
  first_name: z.string().trim().min(1).max(120),
  last_name: z.string().trim().min(1).max(120),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  unique_id: z.string().trim().min(1).max(64),
});

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("fr-FR");
}

function normalizeUniqueId(value: string): string {
  return value.trim().toUpperCase();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function ensureClientRole(userId: string): Promise<void> {
  await withSession({ role: "service", claims: null }, async (client) => {
    await client.query(
      `INSERT INTO public.user_roles (user_id, role)
       VALUES ($1, 'client')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId],
    );
    await client.query(`DELETE FROM public.user_roles WHERE user_id = $1 AND role = 'citoyen'`, [
      userId,
    ]);
  });
}

async function createClientUser(emailCandidate: string, fullName: string): Promise<string> {
  return withSession({ role: "service", claims: null }, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO auth.users (email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
       VALUES ($1, now(), $2::jsonb, '{}'::jsonb)
       RETURNING id`,
      [emailCandidate, JSON.stringify({ full_name: fullName })],
    );
    return rows[0]!.id;
  });
}

export const Route = createFileRoute("/api/auth/discord/onboarding")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawContext = readCookie(request, DISCORD_ONBOARDING_COOKIE);
        const context = decodeOnboardingContext(rawContext);

        const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
        headers.append("Set-Cookie", expireCookie(DISCORD_ONBOARDING_COOKIE));

        if (!context) {
          return new Response(
            JSON.stringify({ ok: false, message: "Session d'inscription expirée. Recommencez la connexion Discord." }),
            { status: 400, headers },
          );
        }

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, message: "Requête invalide." }), {
            status: 400,
            headers,
          });
        }

        const parsed = payloadSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ ok: false, message: "Informations incomplètes ou invalides." }), {
            status: 422,
            headers,
          });
        }

        const data = parsed.data;
        const normalizedUniqueId = normalizeUniqueId(data.unique_id);
        const normalizedFirstName = normalizeName(data.first_name);
        const normalizedLastName = normalizeName(data.last_name);
        const uniqueLength = Math.min(Math.max(normalizedUniqueId.length, 4), 32);

        try {
          const clientRecord = await withSession({ role: "service", claims: null }, async (client) => {
            const rowShape = `id, first_name, last_name, birth_date::text, email, profile_id, firm_id, discord_user_id`;

            const byUuid = isUuid(normalizedUniqueId)
              ? await client.query<{
                  id: string;
                  first_name: string;
                  last_name: string;
                  birth_date: string | null;
                  email: string | null;
                  profile_id: string | null;
                  firm_id: string | null;
                  discord_user_id: string | null;
                }>(
                  `SELECT ${rowShape}
                     FROM public.clients
                    WHERE id = $1
                    LIMIT 1`,
                  [normalizedUniqueId],
                )
              : null;

            if (byUuid?.rows?.[0]) return byUuid.rows[0];

            const { rows } = await client.query<{
              id: string;
              first_name: string;
              last_name: string;
              birth_date: string | null;
              email: string | null;
              profile_id: string | null;
              firm_id: string | null;
              discord_user_id: string | null;
            }>(
              `SELECT ${rowShape}
                 FROM public.clients
                WHERE lower(trim(first_name)) = $1
                  AND lower(trim(last_name)) = $2
                  AND birth_date = $3::date
                  AND right(upper(replace(id::text, '-', '')), $4) = $5
                LIMIT 2`,
              [normalizedFirstName, normalizedLastName, data.birth_date, uniqueLength, normalizedUniqueId],
            );
            if (rows.length !== 1) return null;
            return rows[0];
          });

          if (!clientRecord || !clientRecord.firm_id) {
            return new Response(
              JSON.stringify({ ok: false, message: "Client introuvable. Vérifiez votre ID unique." }),
              { status: 404, headers },
            );
          }

          const sameIdentity =
            normalizeName(clientRecord.first_name) === normalizedFirstName &&
            normalizeName(clientRecord.last_name) === normalizedLastName &&
            String(clientRecord.birth_date ?? "") === data.birth_date;

          if (!sameIdentity) {
            return new Response(
              JSON.stringify({ ok: false, message: "Les informations ne correspondent pas à la fiche client." }),
              { status: 403, headers },
            );
          }

          if (clientRecord.discord_user_id && clientRecord.discord_user_id !== context.discordUserId) {
            return new Response(
              JSON.stringify({ ok: false, message: "Cette fiche client est déjà liée à un autre compte Discord." }),
              { status: 409, headers },
            );
          }

          let profileId = clientRecord.profile_id;
          if (!profileId) {
            const fullName = `${clientRecord.first_name} ${clientRecord.last_name}`;
            const emailCandidate =
              clientRecord.email ?? context.discordEmail ?? `discord-${context.discordUserId}@clients.local`;
            profileId = await createClientUser(emailCandidate.toLowerCase(), fullName);

            await withSession({ role: "service", claims: null }, async (client) => {
              await client.query(
                `INSERT INTO public.profiles (id, full_name)
                 VALUES ($1, $2)
                 ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name`,
                [profileId, fullName],
              );

              await client.query(
                `UPDATE public.clients
                    SET profile_id = $2,
                        updated_at = now()
                  WHERE id = $1`,
                [clientRecord.id, profileId],
              );
            });
          }

          await ensureClientRole(profileId);

          await withSession({ role: "service", claims: null }, async (client) => {
            await client.query(
              `UPDATE public.clients
                  SET discord_user_id = $2,
                      discord_username = $3,
                      updated_at = now()
                WHERE id = $1`,
              [clientRecord.id, context.discordUserId, context.discordUsername],
            );
          });

          const session = await issueSessionForUserId(profileId);

          return new Response(
            JSON.stringify({
              ok: true,
              session,
              redirectTo: sanitizeRedirect(context.redirectTo),
            }),
            { status: 200, headers },
          );
        } catch {
          return new Response(
            JSON.stringify({ ok: false, message: "Inscription impossible pour le moment. Réessayez." }),
            { status: 500, headers },
          );
        }
      },
    },
  },
});
