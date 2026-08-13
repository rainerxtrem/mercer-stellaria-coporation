import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

const DEFAULT_ROOT = process.env.NODE_ENV === "production" ? "/data/storage" : ".data/storage";

export function storageRoot(): string {
  const configured = process.env.STORAGE_ROOT?.trim();
  if (!configured) return resolve(DEFAULT_ROOT);

  // In production, refuse relative paths so deployments cannot reset uploaded docs.
  if (process.env.NODE_ENV === "production" && !configured.startsWith("/")) {
    return "/data/storage";
  }

  return resolve(configured);
}

/** Rejects absolute paths, `..` segments and anything escaping the bucket root. */
export function resolveObjectPath(bucket: string, name: string): string {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(bucket)) {
    throw new Error(`Invalid bucket name: ${bucket}`);
  }
  if (!name || name.startsWith("/") || name.includes("\0")) {
    throw new Error(`Invalid object path: ${name}`);
  }
  const bucketRoot = join(storageRoot(), bucket);
  const target = resolve(bucketRoot, name);
  if (target !== bucketRoot && !target.startsWith(bucketRoot + sep)) {
    throw new Error(`Invalid object path: ${name}`);
  }
  return target;
}

export async function writeObject(bucket: string, name: string, body: Buffer): Promise<void> {
  const target = resolveObjectPath(bucket, name);
  await mkdir(dirname(target), { recursive: true });
  // Write to a sibling temp file first so a crash never leaves a partial object.
  const temp = `${target}.${randomUUID()}.part`;
  await writeFile(temp, body);
  const { rename } = await import("node:fs/promises");
  await rename(temp, target);
}

export async function readObject(bucket: string, name: string): Promise<Buffer> {
  return readFile(resolveObjectPath(bucket, name));
}

export function createObjectStream(bucket: string, name: string) {
  return createReadStream(resolveObjectPath(bucket, name));
}

export async function objectSize(bucket: string, name: string): Promise<number | null> {
  try {
    const info = await stat(resolveObjectPath(bucket, name));
    return info.size;
  } catch {
    return null;
  }
}

export async function deleteObject(bucket: string, name: string): Promise<void> {
  await rm(resolveObjectPath(bucket, name), { force: true });
}

export async function copyObject(bucket: string, from: string, to: string): Promise<void> {
  await writeObject(bucket, to, await readObject(bucket, from));
}

// ---------------------------------------------------------------------------
// Signed tokens
// ---------------------------------------------------------------------------

export type SignedPayload = {
  bucket: string;
  path: string;
  operation: "download" | "upload";
  exp: number;
  download?: string;
};

function signingKey(): string {
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret) throw new Error("AUTH_JWT_SECRET is required to sign storage URLs.");
  return secret;
}

export function signStorageToken(payload: SignedPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyStorageToken(token: string): SignedPayload {
  const [body, signature] = token.split(".");
  if (!body || !signature) throw new Error("Malformed storage token");

  const expected = createHmac("sha256", signingKey()).update(body).digest("base64url");
  const given = Buffer.from(signature);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) {
    throw new Error("Invalid storage token signature");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SignedPayload;
  if (payload.exp * 1000 < Date.now()) throw new Error("Storage token has expired");
  return payload;
}
