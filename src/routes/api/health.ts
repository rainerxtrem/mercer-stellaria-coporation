import { createFileRoute } from "@tanstack/react-router";

import { withSession } from "@/backend/db/execute";
import { json } from "@/backend/http/context";

/** Liveness/readiness probe for Railway: confirms the process can reach PostgreSQL. */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        try {
          await withSession({ role: "service", claims: null }, async (client) => {
            await client.query("SELECT 1");
          });
          return json({ status: "ok", database: "up" });
        } catch (error) {
          return json(
            { status: "degraded", database: "down", message: (error as Error).message },
            503,
          );
        }
      },
    },
  },
});
