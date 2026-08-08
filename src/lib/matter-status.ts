export const MATTER_STATUSES = ["open", "pending", "instance", "closed", "archived"] as const;
export type MatterStatus = (typeof MATTER_STATUSES)[number];

export const MATTER_STATUS_META: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  open: { label: "En cours", dot: "bg-success", badge: "bg-success/15 text-success" },
  pending: { label: "En attente", dot: "bg-warning", badge: "bg-warning/15 text-warning" },
  instance: { label: "En instance", dot: "bg-info", badge: "bg-info/15 text-info" },
  closed: { label: "Clôturé", dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
  archived: { label: "Archivé", dot: "bg-muted-foreground", badge: "bg-muted text-muted-foreground" },
};

/** Statuses selectable by users in the UI (archived is a legacy/system state). */
export const MATTER_STATUS_OPTIONS: MatterStatus[] = ["open", "pending", "instance", "closed"];

export function matterStatusMeta(status: string) {
  return (
    MATTER_STATUS_META[status] ?? {
      label: status,
      dot: "bg-secondary",
      badge: "bg-secondary text-secondary-foreground",
    }
  );
}

export function matterStatusLabel(status: string) {
  return matterStatusMeta(status).label;
}
