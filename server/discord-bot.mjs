import { createServer } from "node:http";
import process from "node:process";
import { ActivityType, Client, Events, GatewayIntentBits } from "discord.js";

/**
 * Railway 24/7 Discord bot process.
 *
 * This service keeps a single long-lived Discord gateway session and exposes
 * /api/health so container health checks can verify readiness.
 */

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? "0.0.0.0";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function pickBotToken() {
  return (
    process.env.DISCORD_BOT_TOKEN?.trim() ||
    process.env.DISCORD_TOKEN?.trim() ||
    process.env.BOT_TOKEN?.trim() ||
    null
  );
}

const BOT_TOKEN = pickBotToken();
if (!BOT_TOKEN) {
  throw new Error("Missing environment variable: DISCORD_BOT_TOKEN");
}

const EXPECTED_GUILD_ID = process.env.DISCORD_GUILD_ID?.trim() || null;
const BOT_ACTIVITY = (process.env.DISCORD_BOT_ACTIVITY ?? "Portail client Mercer & Stellaria").trim();
const BOT_STATUS = (process.env.DISCORD_BOT_STATUS ?? "online").trim();

const state = {
  ready: false,
  readyAt: null,
  botUserTag: null,
  lastError: null,
  startedAt: new Date().toISOString(),
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (readyClient) => {
  state.ready = true;
  state.readyAt = new Date().toISOString();
  state.botUserTag = readyClient.user.tag;
  state.lastError = null;

  readyClient.user.setPresence({
    status: BOT_STATUS,
    activities: BOT_ACTIVITY
      ? [
          {
            name: BOT_ACTIVITY,
            type: ActivityType.Watching,
          },
        ]
      : [],
  });

  console.log(`[discord-bot] Logged in as ${readyClient.user.tag}`);

  if (EXPECTED_GUILD_ID) {
    try {
      await readyClient.guilds.fetch(EXPECTED_GUILD_ID);
      console.log(`[discord-bot] Guild check OK (${EXPECTED_GUILD_ID})`);
    } catch {
      console.warn(
        `[discord-bot] Bot is not in configured guild ${EXPECTED_GUILD_ID}. Invite it or clear DISCORD_GUILD_ID for bot service.`,
      );
    }
  }
});

client.on(Events.Error, (error) => {
  state.lastError = error?.message ?? String(error);
  console.error("[discord-bot] Client error", error);
});

client.on(Events.ShardDisconnect, (closeEvent, shardId) => {
  state.ready = false;
  state.lastError = `Shard ${shardId} disconnected (${closeEvent.code})`;
  console.warn("[discord-bot] Gateway disconnected", { shardId, code: closeEvent.code });
});

client.on(Events.ShardResume, (shardId, replayedEvents) => {
  state.ready = true;
  state.lastError = null;
  console.log("[discord-bot] Gateway resumed", { shardId, replayedEvents });
});

const healthServer = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname !== "/api/health") {
    res.statusCode = 404;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "not_found" }));
    return;
  }

  const payload = {
    ok: state.ready,
    service: "discord-bot",
    started_at: state.startedAt,
    ready_at: state.readyAt,
    bot_user: state.botUserTag,
    guild_id: EXPECTED_GUILD_ID,
    last_error: state.lastError,
  };

  res.statusCode = state.ready ? 200 : 503;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
});

healthServer.listen(PORT, HOST, () => {
  console.log(`[discord-bot] Health server listening on http://${HOST}:${PORT}`);
});

await client.login(BOT_TOKEN);

async function shutdown(signal) {
  console.log(`[discord-bot] ${signal} received, shutting down`);

  try {
    await client.destroy();
  } catch {
    // no-op during shutdown
  }

  healthServer.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 10_000).unref();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}
