import { createFileRoute } from "@tanstack/react-router";

import { withSession } from "@/backend/db/execute";
import { readObject, verifyStorageToken } from "@/backend/storage/files";
import { errorResponse, json } from "@/backend/http/context";

function contentDispositionFilename(name: string): string {
  const fallback = name.replace(/[^\w.-]+/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Serves an object to anyone holding a valid, unexpired signed URL. */
export const Route = createFileRoute("/api/storage/object")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const token = new URL(request.url).searchParams.get("token");
          if (!token) return json({ message: "Missing token" }, 400);

          const payload = verifyStorageToken(token);
          if (payload.operation !== "download") {
            return json({ message: "Token is not a download token" }, 403);
          }

          const metadata = await withSession({ role: "service", claims: null }, async (client) => {
            const { rows } = await client.query<{ metadata: Record<string, unknown> }>(
              `SELECT metadata FROM storage.objects WHERE bucket_id = $1 AND name = $2`,
              [payload.bucket, payload.path],
            );
            return rows[0]?.metadata ?? {};
          });

          const body = await readObject(payload.bucket, payload.path);
          const headers: Record<string, string> = {
            "content-type": String(metadata.mimetype ?? "application/octet-stream"),
            "content-length": String(body.byteLength),
            "cache-control": "private, max-age=0, no-store",
          };
          if (payload.download) {
            headers["content-disposition"] = contentDispositionFilename(payload.download);
          }

          return new Response(new Uint8Array(body), { status: 200, headers });
        } catch (error) {
          return errorResponse(error, 403);
        }
      },
    },
  },
});
