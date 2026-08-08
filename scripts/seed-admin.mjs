#!/usr/bin/env node
/**
 * Creates (or updates) the first administrator account — the `batonnier` role
 * that unlocks the back office on a fresh database.
 *
 *   node scripts/seed-admin.mjs --email admin@example.com --password '...'
 *
 * The password may also be supplied through ADMIN_PASSWORD to keep it out of
 * the shell history. Re-running the script is safe: it never deletes anything.
 */
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import pg from "pg";

const require = createRequire(import.meta.url);
const bcrypt = require("bcryptjs");

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
    name: { type: "string" },
  },
});

const email = values.email ?? process.env.ADMIN_EMAIL;
const password = values.password ?? process.env.ADMIN_PASSWORD;
const fullName = values.name ?? process.env.ADMIN_NAME ?? "Administrateur";

if (!email || !password) {
  console.error("Usage: node scripts/seed-admin.mjs --email <email> --password <password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("The password must be at least 8 characters long.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl:
    process.env.DATABASE_SSL === "disable"
      ? false
      : /[?&]sslmode=require/.test(connectionString)
        ? { rejectUnauthorized: false }
        : false,
});

await client.connect();

try {
  await client.query("BEGIN");

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await client.query(
    `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, raw_user_meta_data)
     VALUES ($1, $2, now(), jsonb_build_object('full_name', $3::text))
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [email, hash, fullName],
  );

  let userId = rows[0]?.id;

  if (!userId) {
    const existing = await client.query(
      `SELECT id FROM auth.users WHERE lower(email) = lower($1)`,
      [email],
    );
    userId = existing.rows[0]?.id;
  }

  if (!userId) {
    // The email already exists with a different casing/unique index hit.
    const updated = await client.query(
      `UPDATE auth.users
          SET encrypted_password = $2,
              email_confirmed_at = COALESCE(email_confirmed_at, now()),
              updated_at = now()
        WHERE lower(email) = lower($1)
        RETURNING id`,
      [email, hash],
    );
    userId = updated.rows[0]?.id;
  } else {
    await client.query(
      `UPDATE auth.users SET encrypted_password = $2, updated_at = now() WHERE id = $1`,
      [userId, hash],
    );
  }

  if (!userId) throw new Error("Could not create or find the administrator account.");

  await client.query(
    `INSERT INTO public.user_roles (user_id, role)
     VALUES ($1, 'batonnier')
     ON CONFLICT (user_id, role) DO NOTHING`,
    [userId],
  );

  await client.query("COMMIT");
  console.log(`Administrator ready: ${email} (${userId})`);
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
