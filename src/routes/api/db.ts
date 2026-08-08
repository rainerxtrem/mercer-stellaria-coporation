import { createFileRoute } from "@tanstack/react-router";

import type { RequestSpec } from "@/lib/pgrest/types";
import { executeSpec } from "@/backend/db/execute";
import { errorResponse, json, readJson, requestAuthContext } from "@/backend/http/context";

/**
 * Data endpoint used by the browser client.
 *
 * The request body only describes *what* to query; the SQL is generated
 * server-side and executed under the caller's PostgreSQL role, so row-level
 * security remains the single source of truth for authorisation.
 */
export const Route = createFileRoute("/api/db")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const spec = await readJson<RequestSpec>(request);
          if (!spec || (spec.kind !== "query" && spec.kind !== "rpc")) {
            return json({ message: "Invalid request specification" }, 400);
          }
          const auth = await requestAuthContext(request);
          return json(await executeSpec(spec, auth));
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
