/**
 * Server-side data clients.
 *
 * `supabaseAdmin` runs as the database owner and therefore bypasses row-level
 * security — the equivalent of the former service-role key. It must only be
 * reached from server handlers; keep using the dynamic-import convention:
 *   const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
 *
 * `supabasePublic` runs as the `anon` role: only data explicitly opened by an
 * RLS policy or a security-definer function is visible.
 */
import { createRpcBuilder, TableBuilder } from "@/lib/pgrest/builder";
import type { RequestSpec } from "@/lib/pgrest/types";
import {
  ANON_CONTEXT,
  SERVICE_CONTEXT,
  executeSpec,
  type DbAuthContext,
} from "@/backend/db/execute";
import { createStorageApi } from "@/backend/storage/api";
import {
  adminCreateUser,
  adminDeleteUser,
  adminInviteUserByEmail,
  adminListUsers,
  getUserFromAccessToken,
} from "@/backend/auth/service";

function wrap<T>(promise: Promise<T>) {
  return promise.then(
    (data) => ({ data, error: null }),
    (error: Error) => ({ data: null, error: { message: error.message } }),
  );
}

export function createServerClient(auth: DbAuthContext) {
  const executor = (spec: RequestSpec) => executeSpec(spec, auth);

  return {
    from(table: string) {
      return new TableBuilder("public", table, executor);
    },
    schema(name: string) {
      return {
        from: (table: string) => new TableBuilder(name, table, executor),
        rpc: (
          fn: string,
          args: Record<string, unknown> = {},
          options: { count?: "exact"; head?: boolean } = {},
        ) => createRpcBuilder(name, fn, args ?? {}, options, executor),
      };
    },
    rpc(
      fn: string,
      args: Record<string, unknown> = {},
      options: { count?: "exact"; head?: boolean } = {},
    ) {
      return createRpcBuilder("public", fn, args ?? {}, options, executor);
    },
    storage: createStorageApi(auth),
    auth: {
      getUser: (jwt: string) => wrap(getUserFromAccessToken(jwt).then((user) => ({ user }))),
      admin: {
        createUser: (input: Parameters<typeof adminCreateUser>[0]) =>
          wrap(adminCreateUser(input).then((user) => ({ user }))),
        deleteUser: (userId: string) => wrap(adminDeleteUser(userId).then(() => ({ user: null }))),
        listUsers: (options?: { page?: number; perPage?: number }) => wrap(adminListUsers(options)),
        inviteUserByEmail: (
          email: string,
          options?: { data?: Record<string, unknown>; redirectTo?: string },
        ) => wrap(adminInviteUserByEmail(email, options).then((user) => ({ user }))),
      },
    },
  };
}

export type ServerClient = ReturnType<typeof createServerClient>;

function lazy(context: DbAuthContext) {
  let client: ServerClient | undefined;
  return new Proxy({} as ServerClient, {
    get(_target, property, receiver) {
      if (!client) client = createServerClient(context);
      return Reflect.get(client, property, receiver);
    },
  });
}

/** Bypasses row-level security. Server handlers only. */
export const supabaseAdmin = lazy(SERVICE_CONTEXT);

/** Anonymous access, subject to the `anon` role policies. */
export const supabasePublic = lazy(ANON_CONTEXT);
