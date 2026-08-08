/** Utilitaires purs partagés par le module de signature électronique. */

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Jeton URL-safe imprévisible (256 bits). */
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identifiant unique lisible de signature. */
export function generateSignatureUid(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const rand = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `MSC-SIG-${new Date().getUTCFullYear()}-${rand}`;
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export const SIGNATURE_EVENT_LABELS: Record<string, string> = {
  link_created: "Lien de signature créé",
  link_revoked: "Lien révoqué",
  opened: "Document consulté par le destinataire",
  signature_started: "Signature commencée",
  signed: "Document signé",
  pdf_generated: "PDF signé généré et archivé",
  notified: "Avocat notifié",
  pin_failed: "Code d'accès incorrect",
};

/** Projection publique (sans données sensibles) d'un document à signer. */
export function publicDoc(inv: any) {
  const cs = inv?.client_snapshot ?? {};
  return {
    id: inv?.id as string,
    number: inv?.number as string,
    kind: inv?.kind as string,
    status: inv?.status as string,
    issue_date: inv?.issue_date as string,
    due_date: inv?.due_date as string | null,
    total: Number(inv?.total ?? 0),
    currency: inv?.currency as string,
    owner_name: inv?.owner_snapshot?.full_name ?? "Avocat",
    client_name: [cs.first_name, cs.last_name].filter(Boolean).join(" ") || null,
    matter_number: inv?.matters?.number ?? null,
  };
}
