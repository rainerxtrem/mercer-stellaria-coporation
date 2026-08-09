import { createFileRoute } from "@tanstack/react-router";

import {
  adminCreateUser,
  exchangeRecoveryToken,
  getUserFromAccessToken,
  refreshSession,
  requestPasswordRecovery,
  signInWithPassword,
  signOut,
  updateOwnUser,
} from "@/backend/auth/service";
import { verifyAccessToken } from "@/backend/auth/jwt";
import { errorResponse, json, readJson } from "@/backend/http/context";

type Body = Record<string, unknown>;

async function handle(action: string, request: Request): Promise<Response> {
  const body = await readJson<Body>(request);

  switch (action) {
    case "signup": {
      const hostname = new URL(request.url).hostname;
      const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
      if (process.env.NODE_ENV === "production" || !isLoopback) {
        return json({ message: "Local signup is disabled" }, 404);
      }
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const fullName = String(body.full_name ?? "").trim();
      await adminCreateUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      const session = await signInWithPassword(email, password);
      return json({ ...session, session, user: session.user });
    }

    case "token": {
      const session = await signInWithPassword(
        String(body.email ?? ""),
        String(body.password ?? ""),
      );
      return json({ ...session, session, user: session.user });
    }

    case "refresh": {
      const session = await refreshSession(String(body.refresh_token ?? ""));
      return json({ ...session, session, user: session.user });
    }

    case "logout": {
      await signOut(body.refresh_token ? String(body.refresh_token) : null, null);
      return json({ ok: true });
    }

    case "user": {
      const user = await getUserFromAccessToken(String(body.access_token ?? ""));
      return json({ user });
    }

    case "recover": {
      await requestPasswordRecovery(
        String(body.email ?? ""),
        body.redirect_to ? String(body.redirect_to) : undefined,
      );
      return json({ ok: true });
    }

    case "verify": {
      // The emailed link only proves identity: it opens a session, and the new
      // password is set afterwards through /api/auth/update-user.
      const session = await exchangeRecoveryToken(String(body.token ?? ""));
      return json({ ...session, session, user: session.user });
    }

    case "update-user": {
      const claims = await verifyAccessToken(String(body.access_token ?? ""));
      const user = await updateOwnUser(claims.sub, {
        email: body.email ? String(body.email) : undefined,
        password: body.password ? String(body.password) : undefined,
        data: (body.data as Record<string, unknown>) ?? undefined,
      });
      return json({ user });
    }

    default:
      return json({ message: "Unknown auth action" }, 404);
  }
}

export const Route = createFileRoute("/api/auth/$action")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          return await handle(params.action, request);
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
