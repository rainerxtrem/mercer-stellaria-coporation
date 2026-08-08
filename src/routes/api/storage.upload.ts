import { createFileRoute } from "@tanstack/react-router";

import { withSession } from "@/backend/db/execute";
import { verifyStorageToken, writeObject } from "@/backend/storage/files";
import { errorResponse, json } from "@/backend/http/context";

const MAX_UPLOAD_BYTES = Number(process.env.STORAGE_MAX_UPLOAD_BYTES ?? 26_214_400);

/**
 * Receives the bytes of an object whose write was already authorised when the
 * signed upload token was issued (under the caller's RLS context).
 */
export const Route = createFileRoute("/api/storage/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const token = new URL(request.url).searchParams.get("token");
          if (!token) return json({ message: "Missing upload token" }, 400);

          const payload = verifyStorageToken(token);
          if (payload.operation !== "upload") {
            return json({ message: "Token is not an upload token" }, 403);
          }

          const buffer = Buffer.from(await request.arrayBuffer());
          if (buffer.byteLength > MAX_UPLOAD_BYTES) {
            return json({ message: "File is too large" }, 413);
          }

          await writeObject(payload.bucket, payload.path, buffer);
          await withSession({ role: "service", claims: null }, async (client) => {
            await client.query(
              `UPDATE storage.objects
                  SET metadata = metadata || jsonb_build_object(
                        'size', $3::bigint,
                        'mimetype', $4::text,
                        'pending', false
                      ),
                      updated_at = now()
                WHERE bucket_id = $1 AND name = $2`,
              [
                payload.bucket,
                payload.path,
                buffer.byteLength,
                request.headers.get("content-type") ?? "application/octet-stream",
              ],
            );
          });

          return json({ Key: `${payload.bucket}/${payload.path}`, path: payload.path });
        } catch (error) {
          return errorResponse(error, 403);
        }
      },
    },
  },
});
