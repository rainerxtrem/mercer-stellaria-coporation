export const DISCORD_ONBOARDING_COOKIE = "sba_discord_onboarding";

export type DiscordOnboardingContext = {
  discordUserId: string;
  discordUsername: string;
  discordEmail: string | null;
  redirectTo: string;
};

function isSecureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

export function sanitizeRedirect(value: string | null): string {
  if (!value) return "/portail-client";
  if (!value.startsWith("/")) return "/portail-client";
  if (value.startsWith("//")) return "/portail-client";
  return value;
}

export function makeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const secure = isSecureCookie() ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function expireCookie(name: string): string {
  const secure = isSecureCookie() ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function encodeOnboardingContext(payload: DiscordOnboardingContext): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeOnboardingContext(raw: string | null): DiscordOnboardingContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      discordUserId?: unknown;
      discordUsername?: unknown;
      discordEmail?: unknown;
      redirectTo?: unknown;
    };
    if (
      typeof parsed.discordUserId !== "string" ||
      typeof parsed.discordUsername !== "string" ||
      (parsed.discordEmail !== null && parsed.discordEmail !== undefined && typeof parsed.discordEmail !== "string") ||
      typeof parsed.redirectTo !== "string"
    ) {
      return null;
    }

    return {
      discordUserId: parsed.discordUserId,
      discordUsername: parsed.discordUsername,
      discordEmail: parsed.discordEmail ?? null,
      redirectTo: sanitizeRedirect(parsed.redirectTo),
    };
  } catch {
    return null;
  }
}

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const chunks = raw.split(";");
  for (const chunk of chunks) {
    const [key, ...rest] = chunk.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
