/** Suivi d'envoi et de signature des devis / factures (client-safe). */

export const DELIVERY_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "signing",
  "signed",
  "refused",
  "expired",
  "cancelled",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  viewed: "Consulté",
  signing: "Signature commencée",
  signed: "Signé",
  refused: "Refusé",
  expired: "Expiré",
  cancelled: "Annulé",
};

export const DELIVERY_MODES = ["portal", "link", "both"] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  portal: "Portail Client",
  link: "Lien sécurisé sans compte",
  both: "Portail Client + lien sécurisé",
};

export function deliveryStatusLabel(status: string | null | undefined): string {
  return DELIVERY_STATUS_LABELS[(status ?? "draft") as DeliveryStatus] ?? "Brouillon";
}

/** Le document est verrouillé : plus aucune modification possible. */
export function isDeliveryLocked(status: string | null | undefined): boolean {
  return ["signed", "cancelled", "expired"].includes(status ?? "");
}
