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

function isUniqueIdConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; message?: unknown; constraint?: unknown };
  const code = typeof err.code === "string" ? err.code : "";
  const constraint = typeof err.constraint === "string" ? err.constraint : "";
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  return (
    code === "23505" &&
    (constraint.includes("clients_portal_unique_id_key") ||
      message.includes("clients_portal_unique_id_key") ||
      message.includes("portal_unique_id"))
  );
}

function isAuthEmailConflictError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: unknown; message?: unknown; constraint?: unknown };
  const code = typeof err.code === "string" ? err.code : "";
  const constraint = typeof err.constraint === "string" ? err.constraint : "";
  const message = typeof err.message === "string" ? err.message.toLowerCase() : "";
  return (
    code === "23505" &&
    (constraint.includes("users_email") ||
      message.includes("users_email") ||
      message.includes("duplicate") ||
      message.includes("email"))
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

async function createOrGetClientUser(
  discordUserId: string,
  fullName: string,
  preferredEmail: string | null,
): Promise<string> {
  const candidates = Array.from(
    new Set([
      `discord-${discordUserId}@clients.local`,
      preferredEmail?.trim().toLowerCase() || "",
    ].filter(Boolean)),
  );

  for (const email of candidates) {
    const existing = await withSession({ role: "service", claims: null }, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `SELECT id
           FROM auth.users
          WHERE lower(email) = lower($1)
          LIMIT 1`,
        [email],
      );
      return rows[0]?.id ?? null;
    });
    if (existing) return existing;

    try {
      return await createClientUser(email, fullName);
    } catch (error) {
      if (isAuthEmailConflictError(error)) continue;
      throw error;
    }
  }

  throw new Error("client_user_create_failed");
}

async function ensureClientEnterpriseMemberships(
  userId: string,
  firmIds: string[],
  preferredFirmId: string,
): Promise<void> {
  const uniqueFirmIds = Array.from(new Set(firmIds.filter(Boolean)));
  if (uniqueFirmIds.length === 0) return;

  const defaultFirmId = uniqueFirmIds.includes(preferredFirmId) ? preferredFirmId : uniqueFirmIds[0]!;

  await withSession({ role: "service", claims: null }, async (client) => {
    await client.query(
      `INSERT INTO public.enterprise_memberships (user_id, firm_id, status, is_default)
       SELECT $1, fid, 'active', false
         FROM unnest($2::uuid[]) AS fid
       ON CONFLICT (user_id, firm_id)
       DO UPDATE SET status = 'active', updated_at = now()`,
      [userId, uniqueFirmIds],
    );

    await client.query(
      `UPDATE public.enterprise_memberships
          SET is_default = (firm_id = $2)
        WHERE user_id = $1`,
      [userId, defaultFirmId],
    );

    await client.query(
      `UPDATE public.profiles
          SET active_firm_id = $2,
              updated_at = now()
        WHERE id = $1`,
      [userId, defaultFirmId],
    );
  });
}

async function resolveActiveFirmIds(): Promise<string[]> {
  return withSession({ role: "service", claims: null }, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id
         FROM public.firms
        WHERE status = 'active'
        ORDER BY created_at ASC`,
    );
    return rows.map((row) => row.id);
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

        if (!/^[A-Z0-9_-]+$/.test(normalizedUniqueId)) {
          return new Response(
            JSON.stringify({ ok: false, message: "L'ID unique ne peut contenir que des lettres, des chiffres, _ ou -." }),
            { status: 422, headers },
          );
        }

        try {
          const clientRecord = await withSession({ role: "service", claims: null }, async (client) => {
            const rowShape = `id, first_name, last_name, birth_date::text, email, profile_id, firm_id, discord_user_id, portal_unique_id`;

            const linkedDiscord = await client.query<{
              id: string;
              first_name: string;
              last_name: string;
              birth_date: string | null;
              email: string | null;
              profile_id: string | null;
              firm_id: string | null;
              discord_user_id: string | null;
              portal_unique_id: string | null;
            }>(
              `SELECT ${rowShape}
                 FROM public.clients
                WHERE discord_user_id = $1
                LIMIT 1`,
              [context.discordUserId],
            );

            const duplicateUniqueId = await client.query<{
              id: string;
            }>(
              `SELECT id
                 FROM public.clients
                WHERE upper(portal_unique_id) = $1
                LIMIT 1`,
              [normalizedUniqueId],
            );

            const linked = linkedDiscord.rows[0] ?? null;
            const duplicate = duplicateUniqueId.rows[0] ?? null;
            if (duplicate && (!linked || duplicate.id !== linked.id)) {
              throw new Error("unique_id_taken");
            }

            if (linked) return linked;

            const { rows } = await client.query<{
              id: string;
              first_name: string;
              last_name: string;
              birth_date: string | null;
              email: string | null;
              profile_id: string | null;
              firm_id: string | null;
              discord_user_id: string | null;
              portal_unique_id: string | null;
            }>(
              `SELECT ${rowShape}
                 FROM public.clients
                WHERE lower(trim(first_name)) = $1
                  AND lower(trim(last_name)) = $2
                  AND birth_date = $3::date
                  AND firm_id IS NOT NULL
                LIMIT 2`,
              [normalizedFirstName, normalizedLastName, data.birth_date],
            );

            if (rows.length > 1) throw new Error("identity_ambiguous");

            if (rows.length !== 1) return null;
            return rows[0];
          });

          let activeClientId: string;
          let activeProfileId: string;
          let activeFirmId: string;
          const activeFirmIds = await resolveActiveFirmIds();

          if (clientRecord) {
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

            if (!clientRecord.firm_id) {
              return new Response(
                JSON.stringify({ ok: false, message: "Client introuvable. Vérifiez vos informations." }),
                { status: 404, headers },
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
              const emailCandidate = clientRecord.email ?? context.discordEmail ?? null;
              profileId = await createOrGetClientUser(context.discordUserId, fullName, emailCandidate);

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

            activeClientId = clientRecord.id;
            activeProfileId = profileId;
            activeFirmId = clientRecord.firm_id;

            await withSession({ role: "service", claims: null }, async (client) => {
              await client.query(
                `UPDATE public.clients
                    SET discord_user_id = $2,
                        discord_username = $3,
                        portal_unique_id = $4,
                        updated_at = now()
                  WHERE id = $1`,
                [activeClientId, context.discordUserId, context.discordUsername, normalizedUniqueId],
              );
            });
          } else {
            const fullName = `${data.first_name} ${data.last_name}`;
            const profileId = await createOrGetClientUser(
              context.discordUserId,
              fullName,
              context.discordEmail ?? null,
            );
            const firmId = activeFirmIds[0] ?? null;

            if (!firmId) {
              return new Response(
                JSON.stringify({ ok: false, message: "Aucune entreprise active trouvée. Contactez la direction." }),
                { status: 409, headers },
              );
            }

            const created = await withSession({ role: "service", claims: null }, async (client) => {
              await client.query(
                `INSERT INTO public.profiles (id, full_name, active_firm_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id)
                 DO UPDATE SET full_name = EXCLUDED.full_name, active_firm_id = EXCLUDED.active_firm_id`,
                [profileId, fullName, firmId],
              );

              const { rows } = await client.query<{ id: string }>(
                `INSERT INTO public.clients (
                    owner_id,
                    firm_id,
                    profile_id,
                    first_name,
                    last_name,
                    birth_date,
                    email,
                    discord_user_id,
                    discord_username,
                    portal_unique_id
                  )
                 VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10)
                 RETURNING id`,
                [
                  profileId,
                  firmId,
                  profileId,
                  data.first_name,
                  data.last_name,
                  data.birth_date,
                  context.discordEmail,
                  context.discordUserId,
                  context.discordUsername,
                  normalizedUniqueId,
                ],
              );

              return rows[0]!.id;
            });

            activeClientId = created;
            activeProfileId = profileId;
            activeFirmId = firmId;
          }

          await ensureClientRole(activeProfileId);
          const membershipFirmIds = activeFirmIds.length > 0
            ? activeFirmIds
            : [activeFirmId];
          await ensureClientEnterpriseMemberships(activeProfileId, membershipFirmIds, activeFirmId);

          const session = await issueSessionForUserId(activeProfileId);

          return new Response(
            JSON.stringify({
              ok: true,
              session,
              redirectTo: sanitizeRedirect(context.redirectTo),
            }),
            { status: 200, headers },
          );
        } catch (error) {
          if (error instanceof Error && error.message === "unique_id_taken") {
            return new Response(
              JSON.stringify({ ok: false, message: "Cet ID unique existe déjà. Choisissez-en un autre." }),
              { status: 409, headers },
            );
          }

          if (isUniqueIdConflictError(error)) {
            return new Response(
              JSON.stringify({ ok: false, message: "Cet ID unique existe déjà. Choisissez-en un autre." }),
              { status: 409, headers },
            );
          }

          if (error instanceof Error && error.message === "client_user_create_failed") {
            return new Response(
              JSON.stringify({ ok: false, message: "Création du compte impossible pour le moment. Réessayez." }),
              { status: 409, headers },
            );
          }

          if (error instanceof Error && error.message === "identity_ambiguous") {
            return new Response(
              JSON.stringify({ ok: false, message: "Plusieurs fiches correspondent. Contactez votre cabinet." }),
              { status: 409, headers },
            );
          }

          return new Response(
            JSON.stringify({ ok: false, message: "Inscription impossible. Contactez la direction si le problème persiste." }),
            { status: 500, headers },
          );
        }
      },
    },
  },
});
