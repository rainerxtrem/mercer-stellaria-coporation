import { createFileRoute } from "@tanstack/react-router";

import { createStorageApi } from "@/backend/storage/api";
import { errorResponse, json, readJson, requestAuthContext } from "@/backend/http/context";

const ALLOWED_OPERATIONS = new Set([
  "remove",
  "list",
  "createSignedUrl",
  "createSignedUploadUrl",
  "copy",
]);

type Payload = { bucket?: unknown; op?: unknown; args?: unknown };

/** Storage operations that need the caller's row-level security context. */
export const Route = createFileRoute("/api/storage/op")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await readJson<Payload>(request);
          const bucket = String(body.bucket ?? "");
          const op = String(body.op ?? "");
          const args = Array.isArray(body.args) ? body.args : [];

          if (!ALLOWED_OPERATIONS.has(op)) {
            return json(
              { data: null, error: { message: `Unsupported storage operation: ${op}` } },
              400,
            );
          }

          const auth = await requestAuthContext(request);
          const api = createStorageApi(auth).from(bucket) as unknown as Record<
            string,
            (...params: unknown[]) => Promise<unknown>
          >;
          return json(await api[op](...args));
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
