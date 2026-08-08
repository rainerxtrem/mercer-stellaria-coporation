import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Verifies the bearer token of a server-function call and exposes a data
 * client bound to the caller's identity, so every query runs under the
 * PostgreSQL row-level security policies for that user.
 */
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();

    if (!request?.headers) {
      throw new Error("Unauthorized: No request headers available");
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      throw new Error("Unauthorized: No authorization header provided");
    }
    if (!authHeader.startsWith("Bearer ")) {
      throw new Error("Unauthorized: Only Bearer tokens are supported");
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token || token.split(".").length !== 3) {
      throw new Error("Unauthorized: Invalid token");
    }

    const { verifyAccessToken } = await import("@/backend/auth/jwt");
    const { createServerClient } = await import("./client.server");

    let claims;
    try {
      claims = await verifyAccessToken(token);
    } catch {
      throw new Error("Unauthorized: Invalid token");
    }

    if (!claims.sub) {
      throw new Error("Unauthorized: No user ID found in token");
    }

    const activeFirmHeader = request.headers.get("x-enterprise-id")?.trim() ?? "";
    const activeFirmId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(activeFirmHeader)
      ? activeFirmHeader
      : null;

    const supabase = createServerClient({
      role: "authenticated",
      claims: {
        ...(claims as unknown as Record<string, unknown>),
        ...(activeFirmId ? { firm_id: activeFirmId } : {}),
      },
    });

    return next({
      context: {
        supabase,
        userId: claims.sub,
        claims,
      },
    });
  },
);
