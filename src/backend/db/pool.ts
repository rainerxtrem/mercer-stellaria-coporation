import pg from "pg";

/**
 * Single shared PostgreSQL pool.
 *
 * Timestamps are returned as raw strings so the JSON shape produced by the
 * query compiler matches what the application received from PostgREST before
 * the migration (ISO-8601 strings, never Date objects).
 */
const { Pool, types } = pg;

// 1114 = timestamp, 1184 = timestamptz, 1082 = date, 1700 = numeric
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1184, (v) => v);
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => v);

let pool: pg.Pool | undefined;

function buildSslConfig(connectionString: string) {
  if (process.env.DATABASE_SSL === "disable") return false;
  if (process.env.DATABASE_SSL === "require") return { rejectUnauthorized: false };
  // Railway's private network terminates TLS with a self-signed certificate.
  return /[?&]sslmode=require/.test(connectionString) ? { rejectUnauthorized: false } : false;
}

export function getPool(): pg.Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. The application cannot reach PostgreSQL.");
  }

  pool = new Pool({
    connectionString,
    ssl: buildSslConfig(connectionString),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 20_000),
  });

  pool.on("error", (error) => {
    console.error("[db] idle client error", error);
  });

  return pool;
}

export type DbClient = pg.PoolClient;
