import bcrypt from "bcryptjs";
import { withSession, type DbAuthContext } from "../db/execute";
import { sendEmail, publicSiteUrl } from "../email/mailer";
import {
  accessTokenTtl,
  generateOpaqueToken,
  hashToken,
  refreshTokenTtl,
  signAccessToken,
  verifyAccessToken,
} from "./jwt";

const SERVICE: DbAuthContext = { role: "service", claims: null };
const BCRYPT_ROUNDS = Number(process.env.AUTH_BCRYPT_ROUNDS ?? 10);
const MIN_PASSWORD_LENGTH = Number(process.env.AUTH_MIN_PASSWORD_LENGTH ?? 8);

export class AuthError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "invalid_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export type AuthUser = {
  id: string;
  aud: string;
  role: string;
  email: string | null;
  email_confirmed_at: string | null;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  identities: unknown[];
  created_at: string;
  updated_at: string;
};

export type AuthSession = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  refresh_token: string;
  user: AuthUser;
};

type UserRow = {
  id: string;
  email: string | null;
  encrypted_password: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  deleted_at: string | null;
  raw_app_meta_data: Record<string, unknown>;
  raw_user_meta_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const USER_COLUMNS = `id, email, encrypted_password, email_confirmed_at, last_sign_in_at,
                      banned_until, deleted_at, raw_app_meta_data, raw_user_meta_data,
                      created_at, updated_at`;

function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    aud: "authenticated",
    role: "authenticated",
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    confirmed_at: row.email_confirmed_at,
    last_sign_in_at: row.last_sign_in_at,
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function assertPasswordStrength(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      `Password should be at least ${MIN_PASSWORD_LENGTH} characters.`,
      422,
      "weak_password",
    );
  }
}

async function findUserByEmail(email: string): Promise<UserRow | null> {
  return withSession(SERVICE, async (client) => {
    const { rows } = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM auth.users WHERE lower(email) = lower($1) AND deleted_at IS NULL`,
      [email],
    );
    return rows[0] ?? null;
  });
}

async function findUserById(id: string): Promise<UserRow | null> {
  return withSession(SERVICE, async (client) => {
    const { rows } = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM auth.users WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ?? null;
  });
}

async function listUserRoles(userId: string): Promise<string[]> {
  return withSession(SERVICE, async (client) => {
    const { rows } = await client.query<{ role: string }>(
      `SELECT role::text FROM public.user_roles WHERE user_id = $1`,
      [userId],
    );
    return rows.map((row) => row.role);
  });
}

async function issueSession(user: UserRow): Promise<AuthSession> {
  const sessionId = crypto.randomUUID();
  const refreshToken = generateOpaqueToken();

  const { token, expiresAt } = await signAccessToken({
    userId: user.id,
    email: user.email,
    sessionId,
    userMetadata: user.raw_user_meta_data ?? {},
    appMetadata: user.raw_app_meta_data ?? {},
  });

  await withSession(SERVICE, async (client) => {
    await client.query(
      `INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + make_interval(secs => $3))`,
      [user.id, hashToken(refreshToken), refreshTokenTtl()],
    );
    await client.query(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1`, [user.id]);
  });

  return {
    access_token: token,
    token_type: "bearer",
    expires_in: accessTokenTtl(),
    expires_at: expiresAt,
    refresh_token: refreshToken,
    user: toAuthUser({ ...user, last_sign_in_at: new Date().toISOString() }),
  };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession> {
  const user = await findUserByEmail(email);

  // Always run a hash comparison so a missing account and a wrong password
  // take the same amount of time.
  const hash =
    user?.encrypted_password ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva";
  const matches = await bcrypt.compare(password, hash);

  if (!user || !user.encrypted_password || !matches) {
    throw new AuthError("Invalid login credentials", 400, "invalid_credentials");
  }

  const roles = await listUserRoles(user.id);
  if (roles.includes("client")) {
    throw new AuthError(
      "Client accounts must sign in through Discord.",
      403,
      "discord_oauth_required",
    );
  }

  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    throw new AuthError("User is banned", 403, "user_banned");
  }
  if (process.env.AUTH_REQUIRE_EMAIL_CONFIRMATION === "true" && !user.email_confirmed_at) {
    throw new AuthError("Email not confirmed", 400, "email_not_confirmed");
  }

  return issueSession(user);
}

export async function issueSessionForUserId(userId: string): Promise<AuthSession> {
  const user = await findUserById(userId);
  if (!user) throw new AuthError("User not found", 404, "user_not_found");
  if (user.banned_until && new Date(user.banned_until) > new Date()) {
    throw new AuthError("User is banned", 403, "user_banned");
  }
  return issueSession(user);
}

export async function refreshSession(refreshToken: string): Promise<AuthSession> {
  const user = await withSession(SERVICE, async (client) => {
    const { rows } = await client.query<{ id: string; user_id: string }>(
      `UPDATE auth.refresh_tokens
          SET revoked_at = now()
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
        RETURNING id, user_id`,
      [hashToken(refreshToken)],
    );
    if (rows.length === 0) return null;
    const { rows: users } = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM auth.users WHERE id = $1 AND deleted_at IS NULL`,
      [rows[0].user_id],
    );
    return users[0] ?? null;
  });

  if (!user) throw new AuthError("Invalid Refresh Token", 401, "refresh_token_not_found");
  return issueSession(user);
}

export async function signOut(refreshToken: string | null, userId: string | null): Promise<void> {
  await withSession(SERVICE, async (client) => {
    if (refreshToken) {
      await client.query(
        `UPDATE auth.refresh_tokens SET revoked_at = now() WHERE token_hash = $1`,
        [hashToken(refreshToken)],
      );
    } else if (userId) {
      await client.query(
        `UPDATE auth.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId],
      );
    }
  });
}

export async function getUserFromAccessToken(token: string): Promise<AuthUser> {
  const claims = await verifyAccessToken(token);
  const user = await findUserById(claims.sub);
  if (!user)
    throw new AuthError("User from sub claim in JWT does not exist", 403, "user_not_found");
  return toAuthUser(user);
}

export async function updateOwnUser(
  userId: string,
  changes: { email?: string; password?: string; data?: Record<string, unknown> },
): Promise<AuthUser> {
  if (changes.password) assertPasswordStrength(changes.password);

  const user = await withSession(SERVICE, async (client) => {
    const assignments: string[] = ["updated_at = now()"];
    const params: unknown[] = [userId];

    if (changes.email) {
      params.push(changes.email);
      assignments.push(`email = $${params.length}`);
    }
    if (changes.password) {
      params.push(await bcrypt.hash(changes.password, BCRYPT_ROUNDS));
      assignments.push(`encrypted_password = $${params.length}`);
    }
    if (changes.data) {
      params.push(JSON.stringify(changes.data));
      assignments.push(`raw_user_meta_data = raw_user_meta_data || $${params.length}::jsonb`);
    }

    const { rows } = await client.query<UserRow>(
      `UPDATE auth.users SET ${assignments.join(", ")} WHERE id = $1 RETURNING ${USER_COLUMNS}`,
      params,
    );
    return rows[0] ?? null;
  });

  if (!user) throw new AuthError("User not found", 404, "user_not_found");
  return toAuthUser(user);
}

// ---------------------------------------------------------------------------
// One-time tokens (recovery / invitation)
// ---------------------------------------------------------------------------

async function issueOneTimeToken(
  userId: string,
  type: "recovery" | "invite" | "confirmation",
  ttlSeconds: number,
): Promise<string> {
  const token = generateOpaqueToken();
  await withSession(SERVICE, async (client) => {
    await client.query(
      `INSERT INTO auth.one_time_tokens (user_id, token_hash, token_type, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [userId, hashToken(token), type, ttlSeconds],
    );
  });
  return token;
}

export async function consumeOneTimeToken(
  token: string,
  type: "recovery" | "invite" | "confirmation",
): Promise<UserRow> {
  const user = await withSession(SERVICE, async (client) => {
    const { rows } = await client.query<{ user_id: string }>(
      `UPDATE auth.one_time_tokens
          SET consumed_at = now()
        WHERE token_hash = $1 AND token_type = $2 AND consumed_at IS NULL AND expires_at > now()
        RETURNING user_id`,
      [hashToken(token), type],
    );
    if (rows.length === 0) return null;
    const { rows: users } = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM auth.users WHERE id = $1 AND deleted_at IS NULL`,
      [rows[0].user_id],
    );
    return users[0] ?? null;
  });

  if (!user) throw new AuthError("Invalid or expired token", 401, "otp_expired");
  return user;
}

function actionLink(path: string, token: string, redirectTo?: string): string {
  const url = new URL(`${publicSiteUrl()}${path}`);
  url.searchParams.set("token", token);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

export async function requestPasswordRecovery(email: string, redirectTo?: string): Promise<void> {
  const user = await findUserByEmail(email);
  // Never disclose whether the address exists.
  if (!user) return;

  const token = await issueOneTimeToken(user.id, "recovery", 60 * 60);
  await withSession(SERVICE, async (client) => {
    await client.query(`UPDATE auth.users SET recovery_sent_at = now() WHERE id = $1`, [user.id]);
  });

  const link = actionLink("/reset-password", token, redirectTo);
  const { renderAuthEmail } = await import("../email/templates");
  const rendered = await renderAuthEmail("recovery", { link, email: user.email ?? email });
  await sendEmail({ to: user.email ?? email, ...rendered });
}

export async function exchangeRecoveryToken(token: string): Promise<AuthSession> {
  const user = await consumeOneTimeToken(token, "recovery");

  // Following the emailed link proves control of the mailbox.
  const confirmed = await withSession(SERVICE, async (client) => {
    const { rows } = await client.query<UserRow>(
      `UPDATE auth.users
          SET email_confirmed_at = COALESCE(email_confirmed_at, now()), updated_at = now()
        WHERE id = $1
        RETURNING ${USER_COLUMNS}`,
      [user.id],
    );
    return rows[0];
  });

  return issueSession(confirmed);
}

// ---------------------------------------------------------------------------
// Admin operations (formerly supabase.auth.admin.*)
// ---------------------------------------------------------------------------

export async function adminCreateUser(input: {
  email: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): Promise<AuthUser> {
  if (input.password) assertPasswordStrength(input.password);

  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new AuthError(
      "A user with this email address has already been registered",
      422,
      "email_exists",
    );
  }

  const row = await withSession(SERVICE, async (client) => {
    const { rows } = await client.query<UserRow>(
      `INSERT INTO auth.users
         (email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
       VALUES ($1, $2, CASE WHEN $3::boolean THEN now() ELSE NULL END, $4::jsonb, $5::jsonb)
       RETURNING ${USER_COLUMNS}`,
      [
        input.email,
        input.password ? await bcrypt.hash(input.password, BCRYPT_ROUNDS) : null,
        input.email_confirm ?? true,
        JSON.stringify(input.user_metadata ?? {}),
        JSON.stringify(input.app_metadata ?? {}),
      ],
    );
    return rows[0];
  });

  return toAuthUser(row);
}

export async function adminDeleteUser(userId: string): Promise<void> {
  await withSession(SERVICE, async (client) => {
    await client.query(`DELETE FROM auth.users WHERE id = $1`, [userId]);
  });
}

export async function adminListUsers(
  options: { page?: number; perPage?: number } = {},
): Promise<{ users: AuthUser[] }> {
  const perPage = Math.min(options.perPage ?? 50, 1000);
  const page = Math.max(options.page ?? 1, 1);

  const rows = await withSession(SERVICE, async (client) => {
    const { rows: users } = await client.query<UserRow>(
      `SELECT ${USER_COLUMNS} FROM auth.users
        WHERE deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
      [perPage, (page - 1) * perPage],
    );
    return users;
  });

  return { users: rows.map(toAuthUser) };
}

export async function adminInviteUserByEmail(
  email: string,
  options: { data?: Record<string, unknown>; redirectTo?: string } = {},
): Promise<AuthUser> {
  let user = await findUserByEmail(email);

  if (!user) {
    const created = await withSession(SERVICE, async (client) => {
      const { rows } = await client.query<UserRow>(
        `INSERT INTO auth.users (email, invited_at, raw_user_meta_data)
         VALUES ($1, now(), $2::jsonb)
         RETURNING ${USER_COLUMNS}`,
        [email, JSON.stringify(options.data ?? {})],
      );
      return rows[0];
    });
    user = created;
  } else if (options.data) {
    await withSession(SERVICE, async (client) => {
      await client.query(
        `UPDATE auth.users SET raw_user_meta_data = raw_user_meta_data || $2::jsonb WHERE id = $1`,
        [user!.id, JSON.stringify(options.data)],
      );
    });
  }

  // Invitations reuse the recovery flow: the invitee sets their own password.
  const token = await issueOneTimeToken(user.id, "recovery", 60 * 60 * 24 * 7);
  const link = actionLink("/reset-password", token, options.redirectTo);
  const { renderAuthEmail } = await import("../email/templates");
  const rendered = await renderAuthEmail("invite", { link, email });
  await sendEmail({ to: email, ...rendered });

  return toAuthUser(user);
}
