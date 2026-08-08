import type { PostgrestErrorShape, PostgrestResponse, RequestSpec } from "@/lib/pgrest/types";
import { CompileError, compile } from "./compile";
import { getCatalog } from "./introspect";
import { getPool, type DbClient } from "./pool";

export type DbRole = "anon" | "authenticated" | "service";

export type DbAuthContext = {
  role: DbRole;
  claims: Record<string, unknown> | null;
};

export const SERVICE_CONTEXT: DbAuthContext = { role: "service", claims: null };
export const ANON_CONTEXT: DbAuthContext = { role: "anon", claims: null };

/**
 * Runs `fn` inside a transaction carrying the caller's authorization context.
 *
 * `anon` / `authenticated` switch the PostgreSQL role and publish the JWT
 * claims, so every row-level security policy written for Supabase keeps
 * working untouched. `service` stays on the owning role, which bypasses RLS —
 * the equivalent of the former service-role key.
 */
export async function withSession<T>(
  auth: DbAuthContext,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  const client = (await getPool().connect()) as DbClient;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL TimeZone TO 'UTC'");
    if (auth.role !== "service") {
      await client.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(auth.claims ?? {}),
      ]);
      // Role name comes from a closed union, never from user input.
      await client.query(
        auth.role === "authenticated" ? "SET LOCAL ROLE authenticated" : "SET LOCAL ROLE anon",
      );
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function toPostgrestError(error: unknown): PostgrestErrorShape {
  if (error instanceof CompileError) {
    return { message: error.message, details: null, hint: null, code: error.code };
  }
  const err = error as { message?: string; detail?: string; hint?: string; code?: string };
  return {
    message: err?.message ?? "Database error",
    details: err?.detail ?? null,
    hint: err?.hint ?? null,
    code: err?.code ?? "XX000",
  };
}

function statusForError(code: string): number {
  if (code === "42501") return 403; // insufficient_privilege / RLS violation
  if (code === "23505") return 409; // unique violation
  if (code === "23503" || code === "23514" || code === "23502") return 400;
  if (code === "PGRST116") return 406;
  if (code === "42P01" || code === "42883") return 404;
  if (code.startsWith("22") || code.startsWith("PGRST")) return 400;
  return 500;
}

export async function executeSpec(
  spec: RequestSpec,
  auth: DbAuthContext,
): Promise<PostgrestResponse> {
  try {
    const catalog = await getCatalog();
    const compiled = compile(spec, catalog);

    const { rows, count } = await withSession(auth, async (client) => {
      if (auth.role === "authenticated") {
        const targetKind = spec.kind === "rpc" ? "rpc" : "table";
        const targetName = spec.kind === "rpc" ? `${spec.schema}.${spec.fn}` : `${spec.schema}.${spec.table}`;
        const guard = await client.query<{ allowed: boolean }>(
          "SELECT app_private.can_access_api_target($1, $2) AS allowed",
          [targetKind, targetName],
        );
        if (!guard.rows[0]?.allowed) {
          const error = new Error("Module désactivé ou accès entreprise non autorisé.") as Error & { code?: string };
          error.code = "42501";
          throw error;
        }
      }

      const main = await client.query(compiled.text, compiled.params as unknown[]);
      let total: number | null = null;
      if (compiled.countText) {
        const countResult = await client.query(
          compiled.countText,
          compiled.countParams as unknown[],
        );
        total = Number(countResult.rows[0]?.c ?? 0);
      }
      return { rows: main.rows, count: total };
    });

    return shapeResponse(spec, compiled.rowColumn, compiled.scalar, rows, count);
  } catch (error) {
    const shaped = toPostgrestError(error);
    return {
      data: null,
      error: shaped,
      count: null,
      status: statusForError(shaped.code),
      statusText: shaped.code,
    };
  }
}

function shapeResponse(
  spec: RequestSpec,
  rowColumn: string,
  scalar: boolean,
  rows: Array<Record<string, unknown>>,
  count: number | null,
): PostgrestResponse {
  const wantsRows = spec.kind === "rpc" ? true : spec.select !== null;

  if (spec.head) {
    return { data: null, error: null, count, status: 200, statusText: "OK" };
  }

  if (!wantsRows) {
    return { data: null, error: null, count, status: 204, statusText: "No Content" };
  }

  if (scalar) {
    const value = rows[0]?.[rowColumn] ?? null;
    return { data: value as unknown, error: null, count, status: 200, statusText: "OK" };
  }

  const values = rows.map((row) => row[rowColumn] ?? null);

  if (spec.single) {
    if (values.length === 1) {
      return { data: values[0], error: null, count, status: 200, statusText: "OK" };
    }
    if (values.length === 0 && spec.single === "maybe") {
      return { data: null, error: null, count, status: 200, statusText: "OK" };
    }
    const message =
      values.length === 0
        ? "JSON object requested, multiple (or no) rows returned"
        : "JSON object requested, multiple (or no) rows returned";
    return {
      data: null,
      error: {
        message,
        details: `Results contain ${values.length} rows`,
        hint: null,
        code: "PGRST116",
      },
      count,
      status: 406,
      statusText: "Not Acceptable",
    };
  }

  const status =
    spec.kind === "query" && (spec.method === "insert" || spec.method === "upsert") ? 201 : 200;
  return { data: values, error: null, count, status, statusText: "OK" };
}
