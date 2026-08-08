export function isAccessRelatedMessagingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  return [
    "row-level security",
    "permission denied",
    "not authorized",
    "unauthorized",
    "forbidden",
    "introuvable",
    "non autoris",
    "does not exist",
    "doesn't exist",
    "not found",
    "not exist",
    "no rows",
    "0 rows",
    "not visible",
  ].some((fragment) => normalized.includes(fragment));
}
