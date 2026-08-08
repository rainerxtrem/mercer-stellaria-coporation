type DiscordTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

type DiscordUser = {
  id: string;
  username: string;
  global_name?: string | null;
  email?: string | null;
};

type DiscordGuild = {
  id: string;
  name: string;
};

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function getDiscordConfig() {
  const clientId = requiredEnv("DISCORD_CLIENT_ID");
  const clientSecret = requiredEnv("DISCORD_CLIENT_SECRET");
  const guildId = process.env.DISCORD_GUILD_ID?.trim() || null;
  const baseUrl = (process.env.APP_BASE_URL ?? process.env.PUBLIC_SITE_URL ?? "http://localhost:8080").replace(/\/$/, "");
  const defaultRedirect = `${baseUrl}/api/auth/discord/callback`;
  const redirectUri = (process.env.DISCORD_REDIRECT_URI ?? defaultRedirect).trim();
  const scopes = (process.env.DISCORD_OAUTH_SCOPES ?? "identify email guilds").trim();

  return { clientId, clientSecret, guildId, redirectUri, scopes };
}

export function buildDiscordAuthorizeUrl(state: string, redirectUriOverride?: string): string {
  const cfg = getDiscordConfig();
  const redirectUri = redirectUriOverride?.trim() || cfg.redirectUri;
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("scope", cfg.scopes);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeDiscordCode(code: string, redirectUriOverride?: string): Promise<DiscordTokenResponse> {
  const cfg = getDiscordConfig();
  const redirectUri = redirectUriOverride?.trim() || cfg.redirectUri;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error((payload.error_description as string) ?? "Discord token exchange failed");
  }

  return payload as unknown as DiscordTokenResponse;
}

async function discordGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error((payload.message as string) ?? `Discord API error (${response.status})`);
  }
  return payload as unknown as T;
}

export async function getDiscordUser(accessToken: string): Promise<DiscordUser> {
  return discordGet<DiscordUser>("/users/@me", accessToken);
}

export async function listDiscordGuilds(accessToken: string): Promise<DiscordGuild[]> {
  return discordGet<DiscordGuild[]>("/users/@me/guilds", accessToken);
}

export async function assertDiscordGuildMembership(accessToken: string): Promise<void> {
  const { guildId } = getDiscordConfig();
  if (!guildId) return;
  const guilds = await listDiscordGuilds(accessToken);
  const inGuild = guilds.some((guild) => guild.id === guildId);
  if (!inGuild) {
    throw new Error("Discord account is not a member of the configured server.");
  }
}
