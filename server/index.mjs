import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";

/**
 * Production HTTP server.
 *
 * Serves the client build from disk and hands every other request to the
 * TanStack Start SSR handler. Listens on the port provided by the platform.
 */

const CLIENT_DIR = resolve(process.env.CLIENT_DIR ?? "dist/client");
const SERVER_ENTRY = process.env.SERVER_ENTRY ?? "../dist/server/server.js";
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const { default: handler } = await import(SERVER_ENTRY);

/** Resolves a URL path inside the client directory, refusing traversal. */
function resolveStaticFile(pathname) {
  const decoded = decodeURIComponent(pathname);
  if (decoded.includes("\0")) return null;

  const candidate = resolve(CLIENT_DIR, `.${normalize(decoded)}`);
  if (candidate !== CLIENT_DIR && !candidate.startsWith(CLIENT_DIR + sep)) return null;
  if (!existsSync(candidate) || !statSync(candidate).isFile()) return null;
  return candidate;
}

function toWebRequest(req) {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(key, item);
    else headers.set(key, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  for (const [key, value] of response.headers) res.setHeader(key, value);
  if (!response.body) return res.end();
  await Readable.fromWeb(response.body).pipe(res);
}

const server = createServer((req, res) => {
  const pathname = (req.url ?? "/").split("?")[0];

  if (req.method === "GET" || req.method === "HEAD") {
    const file = resolveStaticFile(pathname);
    if (file) {
      const immutable = pathname.startsWith("/assets/");
      res.setHeader(
        "content-type",
        MIME_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      );
      res.setHeader(
        "cache-control",
        immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      );
      res.setHeader("content-length", statSync(file).size);
      if (req.method === "HEAD") return res.end();
      return createReadStream(file).pipe(res);
    }
  }

  Promise.resolve()
    .then(() => handler.fetch(toWebRequest(req), process.env, {}))
    .then((response) => sendWebResponse(res, response))
    .catch((error) => {
      console.error("[server] unhandled request error", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
      }
      res.end("Internal Server Error");
    });
});

server.listen(PORT, HOST, () => {
  console.log(`Listening on http://${HOST}:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
