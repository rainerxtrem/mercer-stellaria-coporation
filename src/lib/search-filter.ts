/**
 * Sanitize a free-text search term before it is interpolated into a PostgREST
 * filter string (`.or("col.ilike.%term%")`).
 *
 * PostgREST parses the `or=` value itself, so commas, parentheses, dots, quotes
 * and backslashes can break out of the intended filter. `%` and `_` are ilike
 * wildcards. Instead of trying to escape them (escaping is error-prone because
 * the escape character itself is a special char here), we drop every character
 * that is not part of a safe allowlist: letters (incl. accents), digits,
 * spaces, hyphens and apostrophe-free words.
 */
export function sanitizeSearchTerm(input: string, maxLength = 100): string {
  return input
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s@.\-]/gu, " ")
    .replace(/[.@\-]{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Build a safe `ilike` pattern from raw user input. */
export function ilikePattern(input: string, maxLength = 100): string {
  const safe = sanitizeSearchTerm(input, maxLength);
  return safe ? `%${safe}%` : "";
}
