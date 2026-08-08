/**
 * Notifications sortantes (serveur uniquement) : portail + webhook Discord.
 * Ne jamais importer depuis un composant.
 */

type Sb = any;

const DISCORD_HOSTS = new Set(["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"]);

export function isValidDiscordWebhook(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && DISCORD_HOSTS.has(u.hostname) && u.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

/** Envoi best-effort : ne bloque jamais l'action métier. */
export async function sendDiscordWebhook(
  url: string | null | undefined,
  payload: { title: string; body?: string | null; link?: string | null },
): Promise<boolean> {
  if (!isValidDiscordWebhook(url)) return false;
  const lines = [`**${payload.title}**`];
  if (payload.body) lines.push(payload.body);
  if (payload.link) lines.push(payload.link);
  try {
    const res = await fetch(url as string, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: lines.join("\n").slice(0, 1900) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Notifie un client : notification interne au portail + webhook Discord perso.
 * `clientRow` doit contenir profile_id et discord_webhook_url.
 */
export async function notifyClient(
  supabaseAdmin: Sb,
  clientRow: { profile_id?: string | null; discord_webhook_url?: string | null } | null | undefined,
  payload: {
    type: string;
    title: string;
    body?: string | null;
    link?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
  },
  origin?: string | null,
) {
  if (!clientRow) return;
  if (clientRow.profile_id) {
    await supabaseAdmin.from("notifications").insert({
      user_id: clientRow.profile_id,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      link: payload.link ?? null,
      entity_type: payload.entity_type ?? null,
      entity_id: payload.entity_id ?? null,
    });
  }
  await sendDiscordWebhook(clientRow.discord_webhook_url, {
    title: payload.title,
    body: "Vous avez une nouvelle notification sur votre portail client securise.",
    link: payload.link && origin ? `${origin}${payload.link}` : null,
  });
}

/** Notifie les membres du cabinet propriétaires d'un dossier. */
export async function notifyUser(
  supabaseAdmin: Sb,
  userId: string | null | undefined,
  payload: { type: string; title: string; body?: string | null; link?: string | null; entity_type?: string | null; entity_id?: string | null },
) {
  if (!userId) return;
  await supabaseAdmin.from("notifications").insert({
    user_id: userId,
    type: payload.type,
    title: payload.title,
    body: payload.body ?? null,
    link: payload.link ?? null,
    entity_type: payload.entity_type ?? null,
    entity_id: payload.entity_id ?? null,
  });
}
