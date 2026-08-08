#!/usr/bin/env node
/**
 * End-to-end verification of the migrated stack.
 *
 * 1. inspects the schema created by the migrations
 * 2. signs in through the HTTP auth endpoint
 * 3. exercises the data endpoint: select, embedded select, count, RPC,
 *    insert / update / delete, and the row-level security boundary
 * 4. exercises the storage pipeline: signed upload URL, upload, signed download
 *
 * Usage: node scripts/verify.mjs --base-url http://127.0.0.1:8080
 */
import { parseArgs } from "node:util";
import pg from "pg";

const { values } = parseArgs({
  options: {
    "base-url": { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
  },
});

const baseUrl = (values["base-url"] ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const email = values.email ?? "verify-admin@example.test";
const password = values.password ?? "VerifyPassw0rd!";

let failures = 0;

function check(label, condition, detail = "") {
  const status = condition ? "PASS" : "FAIL";
  if (!condition) failures++;
  console.log(`[${status}] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

function dbQuery(spec, token) {
  return api("/api/db", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ conditions: [], order: [], select: null, ...spec }),
  });
}

// ---------------------------------------------------------------------------
// 1. Schema
// ---------------------------------------------------------------------------
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "disable" ? false : undefined,
});
await client.connect();

const counts = {};
for (const [key, sql] of Object.entries({
  tables:
    "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
  policies: "SELECT count(*)::int n FROM pg_policies",
  buckets: "SELECT count(*)::int n FROM storage.buckets",
  migrations: "SELECT count(*)::int n FROM public.schema_migrations",
  roles:
    "SELECT count(*)::int n FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')",
  authUsers: "SELECT count(*)::int n FROM auth.users",
})) {
  counts[key] = (await client.query(sql)).rows[0].n;
}

console.log("\n=== Schema ===");
check("public tables created", counts.tables >= 45, `${counts.tables} tables`);
check("row-level security policies present", counts.policies >= 140, `${counts.policies} policies`);
check("storage buckets created", counts.buckets === 3, `${counts.buckets} buckets`);
check("migrations recorded", counts.migrations >= 58, `${counts.migrations} applied`);
check("compat roles created", counts.roles === 3);

const authFns = await client.query(
  `SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname='auth' AND p.proname IN ('uid','jwt','role','email')`,
);
check("auth.uid()/jwt()/role()/email() available", authFns.rows[0].n === 4);

// Seed a disposable administrator for the API checks.
const bcrypt = (await import("bcryptjs")).default;
const hash = await bcrypt.hash(password, 10);
const seeded = await client.query(
  `INSERT INTO auth.users (email, encrypted_password, email_confirmed_at)
   VALUES ($1, $2, now())
   ON CONFLICT DO NOTHING
   RETURNING id`,
  [email, hash],
);
let userId = seeded.rows[0]?.id;
if (!userId) {
  const found = await client.query(`SELECT id FROM auth.users WHERE lower(email)=lower($1)`, [
    email,
  ]);
  userId = found.rows[0]?.id;
  await client.query(`UPDATE auth.users SET encrypted_password=$2 WHERE id=$1`, [userId, hash]);
}
await client.query(
  `INSERT INTO public.user_roles (user_id, role) VALUES ($1,'batonnier')
   ON CONFLICT (user_id, role) DO NOTHING`,
  [userId],
);
check(
  "signup trigger created the profile",
  (await client.query(`SELECT count(*)::int n FROM public.profiles WHERE id=$1`, [userId])).rows[0]
    .n === 1,
);

// ---------------------------------------------------------------------------
// 2. HTTP: health + authentication
// ---------------------------------------------------------------------------
console.log("\n=== Runtime ===");
const health = await api("/api/health");
check(
  "health endpoint reports the database is up",
  health.status === 200 && health.body.database === "up",
);

const login = await api("/api/auth/token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
check("sign in with password", login.status === 200 && Boolean(login.body.access_token));
const token = login.body.access_token;

const badLogin = await api("/api/auth/token", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password: "wrong-password" }),
});
check("wrong password is rejected", badLogin.status === 400);

const refreshed = await api("/api/auth/refresh", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ refresh_token: login.body.refresh_token }),
});
check("refresh token rotation", refreshed.status === 200 && Boolean(refreshed.body.access_token));

// ---------------------------------------------------------------------------
// 3. Data layer
// ---------------------------------------------------------------------------
console.log("\n=== Data (CRUD, embeds, RPC, RLS) ===");

const firm = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "insert",
    values: { number: `VERIF-${Date.now()}`, name: "Cabinet de vérification" },
    select: "id, name, number",
  },
  token,
);
check(
  "insert returns the created row",
  firm.body.status === 201 && firm.body.data?.[0]?.id,
  JSON.stringify(firm.body).slice(0, 200),
);
const firmId = firm.body.data?.[0]?.id;

const lawyer = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "lawyers",
    method: "insert",
    values: {
      license: `LIC-${Date.now()}`,
      first_name: "Test",
      last_name: "Vérification",
      firm_id: firmId,
    },
    select: "id, first_name, firms(name)",
  },
  token,
);
check(
  "embedded resource (many-to-one) is nested",
  lawyer.body.data?.[0]?.firms?.name === "Cabinet de vérification",
  lawyer.body.error?.message ?? JSON.stringify(lawyer.body.data?.[0]?.firms),
);

const embedded = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "select",
    select: "id, name, lawyers(id, last_name)",
    conditions: [{ type: "op", column: "id", operator: "eq", value: firmId }],
    single: "one",
  },
  token,
);
check(
  "embedded resource (one-to-many) returns an array",
  Array.isArray(embedded.body.data?.lawyers) && embedded.body.data.lawyers.length === 1,
  embedded.body.error?.message,
);

const counted = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "select",
    select: "id",
    count: "exact",
    head: true,
  },
  token,
);
check(
  "exact count with head request",
  counted.body.status === 200 && typeof counted.body.count === "number",
);

const ordered = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "select",
    select: "id, name",
    order: [{ column: "name", ascending: true }],
    limit: 5,
  },
  token,
);
check("order + limit", ordered.status === 200 && Array.isArray(ordered.body.data));

const filtered = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "select",
    select: "id, name",
    conditions: [
      {
        type: "or",
        conditions: [
          { type: "op", column: "name", operator: "ilike", value: "%vérification%" },
          { type: "op", column: "number", operator: "ilike", value: "%VERIF%" },
        ],
      },
    ],
  },
  token,
);
check(
  "or() filter",
  filtered.status === 200 && filtered.body.data.length >= 1,
  filtered.body.error?.message,
);

const updated = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "update",
    values: { name: "Cabinet renommé" },
    conditions: [{ type: "op", column: "id", operator: "eq", value: firmId }],
    select: "id, name",
    single: "one",
  },
  token,
);
check(
  "update returns the new value",
  updated.body.data?.name === "Cabinet renommé",
  updated.body.error?.message,
);

const rpc = await dbQuery(
  { kind: "rpc", schema: "public", fn: "has_role", args: { _user_id: userId, _role: "batonnier" } },
  token,
);
check("scalar RPC returns a bare value", rpc.body.data === true, JSON.stringify(rpc.body));

const rpcSet = await dbQuery({
  kind: "rpc",
  schema: "public",
  fn: "list_public_lawyers",
  args: {},
});
check(
  "set-returning RPC returns rows",
  Array.isArray(rpcSet.body.data),
  rpcSet.body.error?.message,
);

const timestamps = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "select",
    select: "created_at",
    conditions: [{ type: "op", column: "id", operator: "eq", value: firmId }],
    single: "one",
  },
  token,
);
check(
  "timestamps are ISO strings, not Date objects",
  typeof timestamps.body.data?.created_at === "string",
  String(timestamps.body.data?.created_at),
);

const anonWrite = await dbQuery({
  kind: "query",
  schema: "public",
  table: "firms",
  method: "insert",
  values: { number: "SHOULD-FAIL", name: "Anonyme" },
  select: "id",
});
check(
  "row-level security blocks anonymous writes",
  anonWrite.body.error !== null && anonWrite.body.status >= 400,
  anonWrite.body.error?.code,
);

const anonRead = await dbQuery({
  kind: "query",
  schema: "public",
  table: "firms",
  method: "select",
  select: "id, name",
  limit: 1,
});
check(
  "row-level security still allows the public read policy",
  anonRead.status === 200 && anonRead.body.error === null,
);

const missing = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "select",
    select: "id",
    conditions: [
      { type: "op", column: "id", operator: "eq", value: "00000000-0000-0000-0000-000000000000" },
    ],
    single: "maybe",
  },
  token,
);
check(
  "maybeSingle() on no rows returns null",
  missing.status === 200 && missing.body.data === null,
);

// ---------------------------------------------------------------------------
// 4. Storage
// ---------------------------------------------------------------------------
console.log("\n=== Storage ===");
const objectPath = `articles/${crypto.randomUUID()}/verify.txt`;
const signedUpload = await api("/api/storage/op", {
  method: "POST",
  headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    bucket: "bar-library",
    op: "createSignedUploadUrl",
    args: [objectPath, {}],
  }),
});
check(
  "signed upload URL issued",
  Boolean(signedUpload.body.data?.token),
  signedUpload.body.error?.message,
);

if (signedUpload.body.data?.token) {
  const uploaded = await fetch(
    `${baseUrl}/api/storage/upload?token=${encodeURIComponent(signedUpload.body.data.token)}`,
    { method: "POST", headers: { "content-type": "text/plain" }, body: "verification payload" },
  );
  check("object uploaded", uploaded.ok);

  const signedDownload = await api("/api/storage/op", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      bucket: "bar-library",
      op: "createSignedUrl",
      args: [objectPath, 60, {}],
    }),
  });
  const url = signedDownload.body.data?.signedUrl;
  check("signed download URL issued", Boolean(url), signedDownload.body.error?.message);

  if (url) {
    const downloaded = await fetch(`${baseUrl}${url}`);
    const content = await downloaded.text();
    check("downloaded content matches", content === "verification payload", content.slice(0, 40));
  }

  const tampered = await fetch(`${baseUrl}/api/storage/object?token=tampered.signature`);
  check("tampered storage token rejected", tampered.status === 403);

  const removed = await api("/api/storage/op", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bucket: "bar-library", op: "remove", args: [[objectPath]] }),
  });
  check("object removed", Array.isArray(removed.body.data) && removed.body.data.length === 1);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------
const deleted = await dbQuery(
  {
    kind: "query",
    schema: "public",
    table: "firms",
    method: "delete",
    conditions: [{ type: "op", column: "id", operator: "eq", value: firmId }],
    select: "id",
  },
  token,
);
check(
  "delete removes the row",
  deleted.status === 200 && deleted.body.error === null,
  deleted.body.error?.message,
);

await client.end();

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);
