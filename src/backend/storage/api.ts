import type { DbAuthContext } from "../db/execute";
import { withSession } from "../db/execute";
import {
  copyObject,
  deleteObject,
  objectSize,
  readObject,
  signStorageToken,
  verifyStorageToken,
  writeObject,
} from "./files";

type Result<T> = { data: T; error: null } | { data: null; error: { message: string } };

function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

function fail(error: unknown): Result<never> {
  const message = error instanceof Error ? error.message : String(error);
  return { data: null, error: { message } };
}

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (typeof (body as Blob)?.arrayBuffer === "function") {
    return Buffer.from(await (body as Blob).arrayBuffer());
  }
  throw new Error("Unsupported upload payload");
}

/**
 * Storage API backed by the mounted volume for the bytes and by
 * `storage.objects` for the metadata — so the row-level security policies
 * written against `storage.objects` keep authorising every operation.
 */
export function createStorageApi(auth: DbAuthContext) {
  return {
    from(bucket: string) {
      /** Registers (or refreshes) the object row under the caller's RLS context. */
      async function claimObject(path: string, metadata: Record<string, unknown>) {
        return withSession(auth, async (client) => {
          const owner = (auth.claims?.sub as string | undefined) ?? null;
          const { rows } = await client.query<{ id: string }>(
            `INSERT INTO storage.objects (bucket_id, name, owner, metadata)
             VALUES ($1, $2, $3, $4::jsonb)
             ON CONFLICT (bucket_id, name)
             DO UPDATE SET metadata = EXCLUDED.metadata, last_accessed_at = now()
             RETURNING id`,
            [bucket, path, owner, JSON.stringify(metadata)],
          );
          if (rows.length === 0) throw new Error("Storage: not authorised to write this object");
          return rows[0].id;
        });
      }

      async function assertReadable(path: string) {
        const allowed = await withSession(auth, async (client) => {
          const { rows } = await client.query(
            `SELECT 1 FROM storage.objects WHERE bucket_id = $1 AND name = $2`,
            [bucket, path],
          );
          return rows.length > 0;
        });
        if (!allowed) throw new Error("Storage: object not found or not accessible");
      }

      return {
        async upload(
          path: string,
          body: unknown,
          options: { contentType?: string; upsert?: boolean } = {},
        ) {
          try {
            const buffer = await toBuffer(body);
            await claimObject(path, {
              size: buffer.byteLength,
              mimetype: options.contentType ?? "application/octet-stream",
            });
            await writeObject(bucket, path, buffer);
            return ok({ path, id: path, fullPath: `${bucket}/${path}` });
          } catch (error) {
            return fail(error);
          }
        },

        async download(path: string) {
          try {
            await assertReadable(path);
            const buffer = await readObject(bucket, path);
            const blob = new Blob([new Uint8Array(buffer)]);
            return ok(blob);
          } catch (error) {
            return fail(error);
          }
        },

        async remove(paths: string[]) {
          try {
            const removed = await withSession(auth, async (client) => {
              const { rows } = await client.query<{ name: string }>(
                `DELETE FROM storage.objects WHERE bucket_id = $1 AND name = ANY($2) RETURNING name`,
                [bucket, paths],
              );
              return rows.map((r) => r.name);
            });
            await Promise.all(removed.map((name) => deleteObject(bucket, name)));
            return ok(removed.map((name) => ({ name })));
          } catch (error) {
            return fail(error);
          }
        },

        async list(prefix = "", options: { limit?: number; offset?: number } = {}) {
          try {
            const rows = await withSession(auth, async (client) => {
              const result = await client.query(
                `SELECT name, metadata, created_at, updated_at
                   FROM storage.objects
                  WHERE bucket_id = $1 AND name LIKE $2
                  ORDER BY name
                  LIMIT $3 OFFSET $4`,
                [bucket, `${prefix}%`, options.limit ?? 100, options.offset ?? 0],
              );
              return result.rows;
            });
            return ok(rows);
          } catch (error) {
            return fail(error);
          }
        },

        async copy(fromPath: string, toPath: string) {
          try {
            await assertReadable(fromPath);
            const size = await objectSize(bucket, fromPath);
            await claimObject(toPath, { size: size ?? 0, mimetype: "application/octet-stream" });
            await copyObject(bucket, fromPath, toPath);
            return ok({ path: toPath });
          } catch (error) {
            return fail(error);
          }
        },

        async createSignedUrl(
          path: string,
          expiresIn: number,
          options: { download?: string } = {},
        ) {
          try {
            await assertReadable(path);
            const token = signStorageToken({
              bucket,
              path,
              operation: "download",
              exp: Math.floor(Date.now() / 1000) + expiresIn,
              download: options.download,
            });
            return ok({
              signedUrl: `/api/storage/object?token=${encodeURIComponent(token)}`,
              path,
            });
          } catch (error) {
            return fail(error);
          }
        },

        async createSignedUploadUrl(path: string, options: { expiresIn?: number } = {}) {
          try {
            // Authorisation is decided here, under the caller's RLS context.
            await claimObject(path, {
              size: 0,
              mimetype: "application/octet-stream",
              pending: true,
            });
            const token = signStorageToken({
              bucket,
              path,
              operation: "upload",
              exp: Math.floor(Date.now() / 1000) + (options.expiresIn ?? 3600),
            });
            return ok({
              signedUrl: `/api/storage/upload?token=${encodeURIComponent(token)}`,
              token,
              path,
            });
          } catch (error) {
            return fail(error);
          }
        },

        async uploadToSignedUrl(path: string, token: string, body: unknown) {
          try {
            const payload = verifyStorageToken(token);
            if (
              payload.bucket !== bucket ||
              payload.path !== path ||
              payload.operation !== "upload"
            ) {
              throw new Error("Storage token does not match the requested object");
            }
            const buffer = await toBuffer(body);
            await writeObject(bucket, path, buffer);
            await withSession({ role: "service", claims: null }, async (client) => {
              await client.query(
                `UPDATE storage.objects
                    SET metadata = metadata || jsonb_build_object('size', $3::bigint, 'pending', false)
                  WHERE bucket_id = $1 AND name = $2`,
                [bucket, path, buffer.byteLength],
              );
            });
            return ok({ path, fullPath: `${bucket}/${path}` });
          } catch (error) {
            return fail(error);
          }
        },
      };
    },
  };
}

export type StorageApi = ReturnType<typeof createStorageApi>;
