import { createFileRoute } from "@tanstack/react-router";

import { errorResponse, json, readJson } from "@/backend/http/context";
import {
  ingestAccountingDiscordWebhook,
  type AccountingDiscordWebhookPayload,
} from "@/lib/accounting.functions";

function isWebhookAuthorized(request: Request): boolean {
  const expected = (process.env.ACCOUNTING_WEBHOOK_TOKEN ?? "").trim();
  if (!expected) return true;

  const url = new URL(request.url);
  const fromHeader = (request.headers.get("x-accounting-token") ?? "").trim();
  const fromQuery = (url.searchParams.get("token") ?? "").trim();

  return fromHeader === expected || fromQuery === expected;
}

export const Route = createFileRoute("/api/comptabilite/discord-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isWebhookAuthorized(request)) {
            return json({ message: "Unauthorized" }, 401);
          }

          const payload = await readJson<AccountingDiscordWebhookPayload>(request);
          const result = await ingestAccountingDiscordWebhook(payload ?? {});

          if (result.status === "duplicate") {
            return json({ ok: true, duplicate: true, ...result });
          }
          if (result.status === "anomaly") {
            return json({ ok: true, anomaly: true, ...result }, 202);
          }

          return json({ ok: true, ...result }, 201);
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
