#!/usr/bin/env node
/**
 * Versioned, non-destructive migration runner.
 *
 *   node scripts/migrate.mjs            apply every pending migration
 *   node scripts/migrate.mjs --status   list applied / pending migrations
 *
 * Each file in db/migrations is applied exactly once, inside its own
 * transaction, ordered by its numeric filename prefix. Applied files are
 * recorded with a checksum so accidental edits to already-applied migrations
 * are detected instead of silently ignored. Nothing is ever dropped.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const ADVISORY_LOCK_KEY = 4_915_233_071n;

function loadMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"))
    .map((filename) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf8");
      return {
        version: filename.replace(/\.sql$/, ""),
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

function connectionConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Point it at your PostgreSQL instance.");
  }
  // Railway's internal network uses self-signed certificates.
  const sslDisabled = process.env.DATABASE_SSL === "disable";
  const needsSsl = !sslDisabled && /[?&]sslmode=require/.test(connectionString);
  return {
    connectionString,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  };
}

async function ensureRegistry(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version     text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      duration_ms integer NOT NULL DEFAULT 0
    )
  `);
}

async function main() {
  const statusOnly = process.argv.includes("--status");
  const migrations = loadMigrations();
  const client = new pg.Client(connectionConfig());
  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY.toString()]);
    await ensureRegistry(client);

    const { rows } = await client.query("SELECT version, checksum FROM public.schema_migrations");
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));

    const drifted = migrations.filter(
      (m) => applied.has(m.version) && applied.get(m.version) !== m.checksum,
    );
    if (drifted.length > 0) {
      throw new Error(
        `Already-applied migrations were modified: ${drifted.map((m) => m.filename).join(", ")}. ` +
          `Add a new migration instead of editing an applied one.`,
      );
    }

    const pending = migrations.filter((m) => !applied.has(m.version));

    if (statusOnly) {
      console.log(`applied: ${applied.size}  pending: ${pending.length}`);
      for (const m of pending) console.log(`  pending  ${m.filename}`);
      return;
    }

    if (pending.length === 0) {
      console.log(`Database is up to date (${applied.size} migrations applied).`);
      return;
    }

    for (const migration of pending) {
      const startedAt = Date.now();
      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO public.schema_migrations (version, checksum, duration_ms)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.checksum, Date.now() - startedAt],
        );
        await client.query("COMMIT");
        console.log(`applied  ${migration.filename}  (${Date.now() - startedAt}ms)`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${migration.filename} failed: ${error.message}`, {
          cause: error,
        });
      }
    }

    console.log(`Done. ${pending.length} migration(s) applied.`);
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY.toString()])
      .catch(() => {});
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
