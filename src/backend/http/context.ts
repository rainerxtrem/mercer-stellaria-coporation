import type { DbAuthContext } from "@/backend/db/execute";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function errorResponse(error: unknown, fallbackStatus = 400): Response {
  const status = (error as { status?: number })?.status ?? fallbackStatus;
  const message = error instanceof Error ? error.message : "Request failed";
  const code = (error as { code?: string })?.code;
  return json({ message, error: code ?? "error", code }, status);
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolves the PostgreSQL authorization context for an incoming request:
 * a valid bearer token yields the `authenticated` role with its JWT claims,
 * anything else falls back to `anon`.
 */
export async function requestAuthContext(request: Request): Promise<DbAuthContext> {
  const token = bearerToken(request);
  if (!token) return { role: "anon", claims: null };

  try {
    const { verifyAccessToken } = await import("@/backend/auth/jwt");
    const claims = (await verifyAccessToken(token)) as unknown as Record<string, unknown>;
    const activeFirmHeader = request.headers.get("x-enterprise-id")?.trim() ?? "";
    const activeFirmId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activeFirmHeader)
      ? activeFirmHeader
      : null;
    return {
      role: "authenticated",
      claims: {
        ...claims,
        ...(activeFirmId ? { firm_id: activeFirmId } : {}),
      },
    };
  } catch {
    return { role: "anon", claims: null };
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { status: 400 });
  }
}
