import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.AUTH_ACCESS_TOKEN_TTL ?? 3600);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_REFRESH_TOKEN_TTL ?? 60 * 60 * 24 * 30);

export type AccessTokenClaims = {
  sub: string;
  email: string | null;
  role: "authenticated";
  aud: "authenticated";
  session_id: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  iat: number;
  exp: number;
};

let cachedSecret: Uint8Array | undefined;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const secret = process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_JWT_SECRET is missing or shorter than 32 characters. Generate one with `openssl rand -base64 48`.",
    );
  }
  cachedSecret = new TextEncoder().encode(secret);
  return cachedSecret;
}

export function accessTokenTtl() {
  return ACCESS_TOKEN_TTL_SECONDS;
}

export async function signAccessToken(input: {
  userId: string;
  email: string | null;
  sessionId: string;
  userMetadata: Record<string, unknown>;
  appMetadata: Record<string, unknown>;
}): Promise<{ token: string; expiresAt: number }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + ACCESS_TOKEN_TTL_SECONDS;

  const token = await new SignJWT({
    email: input.email,
    role: "authenticated",
    session_id: input.sessionId,
    user_metadata: input.userMetadata,
    app_metadata: input.appMetadata,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setAudience("authenticated")
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(getSecret());

  return { token, expiresAt };
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims> {
  const { payload } = await jwtVerify(token, getSecret(), { audience: "authenticated" });
  if (!payload.sub) throw new Error("Token has no subject");
  return payload as unknown as AccessTokenClaims;
}

export function refreshTokenTtl() {
  return REFRESH_TOKEN_TTL_SECONDS;
}

export function generateOpaqueToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
