import fs from "node:fs";
import path from "node:path";

import { createServerClient, type ServerClient } from "@/integrations/supabase/client.server";
import { adminCreateUser, adminDeleteUser, signInWithPassword } from "@/backend/auth/service";
import { ANON_CONTEXT } from "@/backend/db/execute";

function loadEnv() {
  const file = path.join(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}
loadEnv();

export const DATABASE_URL = process.env.DATABASE_URL ?? "";

/** The whole suite needs a reachable database; authenticated cases need nothing more. */
export const canAuthenticate = Boolean(DATABASE_URL && process.env.AUTH_JWT_SECRET);

/** Client running as the `anon` PostgreSQL role — exactly what a visitor gets. */
export function anonClient(): ServerClient {
  return createServerClient(ANON_CONTEXT);
}

const created: string[] = [];

/** Creates a throwaway confirmed account and returns a client authenticated as it. */
export async function newUserClient() {
  if (!canAuthenticate) throw new Error("DATABASE_URL / AUTH_JWT_SECRET unavailable");

  const id = Math.random().toString(36).slice(2, 10);
  const email = `rls-${id}@example.com`;
  const password = "TestPass!2026";

  const user = await adminCreateUser({ email, password, email_confirm: true });
  created.push(user.id);

  const session = await signInWithPassword(email, password);
  const client = createServerClient({
    role: "authenticated",
    claims: {
      sub: user.id,
      email,
      role: "authenticated",
      session_id: session.access_token.slice(-16),
    },
  });

  return { client, email, password, userId: user.id };
}

/** Removes every account created during the suite. */
export async function cleanupUsers() {
  await Promise.all(created.splice(0).map((id) => adminDeleteUser(id)));
}

/** True when the response denies access: either an error, or no row leaked. */
export function isDenied(res: { error: unknown; data: unknown }) {
  if (res.error) return true;
  return Array.isArray(res.data) ? res.data.length === 0 : res.data == null;
}

export const PII_COLUMNS = ["email", "phone", "address", "profile_id"] as const;
