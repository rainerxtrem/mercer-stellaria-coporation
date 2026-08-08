#!/usr/bin/env node
/**
 * Local-only helper: starts a throwaway embedded PostgreSQL instance so the
 * migrations and the data layer can be exercised without Docker.
 * Not used in production.
 */
import { rmSync } from "node:fs";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dataDir = join(process.cwd(), ".data", "pgtest");
const port = Number(process.env.PGTEST_PORT ?? 55433);

if (process.argv.includes("--clean")) {
  rmSync(dataDir, { recursive: true, force: true });
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: "postgres",
  port,
  persistent: true,
});

const action = process.argv[2];

if (action === "stop") {
  await pg.stop();
  console.log("stopped");
  process.exit(0);
}

try {
  await pg.initialise();
} catch {
  // already initialised
}
await pg.start();
try {
  await pg.createDatabase("bar_portal");
} catch {
  // already exists
}
console.log(`postgres://postgres:postgres@localhost:${port}/bar_portal`);
