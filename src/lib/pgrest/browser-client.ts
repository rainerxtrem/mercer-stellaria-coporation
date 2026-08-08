import { createRpcBuilder, TableBuilder } from "./builder";
import type { PostgrestResponse, RequestSpec } from "./types";
import type { BrowserAuthClient } from "./auth-client";
import { readActiveFirmId } from "@/lib/enterprise";

/** Data + storage transport used by the browser, authenticated with the session bearer token. */
export function createBrowserTransport(auth: BrowserAuthClient) {
  async function authHeaders(): Promise<Record<string, string>> {
    const token = await auth.getAccessToken();
    const activeFirmId = readActiveFirmId();
    return {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(activeFirmId ? { "x-enterprise-id": activeFirmId } : {}),
    };
  }

  const executor = async (spec: RequestSpec): Promise<PostgrestResponse> => {
    try {
      const response = await fetch("/api/db", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify(spec),
      });
      return (await response.json()) as PostgrestResponse;
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Network error",
          details: null,
          hint: null,
          code: "NETWORK",
        },
        count: null,
        status: 0,
        statusText: "Network Error",
      };
    }
  };

  async function storageOp(bucket: string, op: string, args: unknown[]) {
    try {
      const response = await fetch("/api/storage/op", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ bucket, op, args }),
      });
      return (await response.json()) as { data: unknown; error: { message: string } | null };
    } catch (error) {
      return {
        data: null,
        error: { message: error instanceof Error ? error.message : "Network error" },
      };
    }
  }

  const storage = {
    from(bucket: string) {
      return {
        remove: (paths: string[]) => storageOp(bucket, "remove", [paths]),
        list: (prefix?: string, options?: unknown) => storageOp(bucket, "list", [prefix, options]),
        createSignedUrl: (path: string, expiresIn: number, options?: unknown) =>
          storageOp(bucket, "createSignedUrl", [path, expiresIn, options]),
        createSignedUploadUrl: (path: string, options?: unknown) =>
          storageOp(bucket, "createSignedUploadUrl", [path, options]),

        async upload(path: string, body: Blob | File, options: { contentType?: string } = {}) {
          const signed = (await storageOp(bucket, "createSignedUploadUrl", [path, {}])) as {
            data: { token: string } | null;
            error: { message: string } | null;
          };
          if (signed.error || !signed.data) return { data: null, error: signed.error };
          return this.uploadToSignedUrl(path, signed.data.token, body, options);
        },

        async uploadToSignedUrl(
          path: string,
          token: string,
          body: Blob | File | ArrayBuffer,
          options: { contentType?: string } = {},
        ) {
          try {
            const response = await fetch(`/api/storage/upload?token=${encodeURIComponent(token)}`, {
              method: "POST",
              headers: {
                "content-type":
                  options.contentType ?? (body as File)?.type ?? "application/octet-stream",
              },
              body: body as BodyInit,
            });
            const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
            if (!response.ok) {
              return {
                data: null,
                error: { message: (payload.message as string) ?? "Upload failed" },
              };
            }
            return { data: { path, fullPath: `${bucket}/${path}` }, error: null };
          } catch (error) {
            return {
              data: null,
              error: { message: error instanceof Error ? error.message : "Upload failed" },
            };
          }
        },

        async download(path: string) {
          const signed = (await storageOp(bucket, "createSignedUrl", [path, 60, {}])) as {
            data: { signedUrl: string } | null;
            error: { message: string } | null;
          };
          if (signed.error || !signed.data) return { data: null, error: signed.error };
          const response = await fetch(signed.data.signedUrl);
          if (!response.ok) return { data: null, error: { message: "Download failed" } };
          return { data: await response.blob(), error: null };
        },
      };
    },
  };

  return { executor, storage };
}

export function createDataApi(executor: (spec: RequestSpec) => Promise<PostgrestResponse>) {
  return {
    from(table: string) {
      return new TableBuilder("public", table, executor);
    },
    schema(name: string) {
      return {
        from: (table: string) => new TableBuilder(name, table, executor),
        rpc: (
          fn: string,
          args: Record<string, unknown> = {},
          options: { count?: "exact"; head?: boolean } = {},
        ) => createRpcBuilder(name, fn, args ?? {}, options, executor),
      };
    },
    rpc(
      fn: string,
      args: Record<string, unknown> = {},
      options: { count?: "exact"; head?: boolean } = {},
    ) {
      return createRpcBuilder("public", fn, args ?? {}, options, executor);
    },
  };
}
