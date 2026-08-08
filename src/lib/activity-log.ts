/**
 * Helpers partagés pour la traçabilité (qui a fait quoi, quand) sur les
 * ressources mutualisées du cabinet : dossiers, clients, devis, factures.
 * Ce module ne contient aucune dépendance serveur : il est importable
 * depuis n'importe quel *.functions.ts.
 */

type Sb = any;

export async function logMatterActivity(
  supabase: Sb,
  userId: string,
  matter_id: string | null | undefined,
  action: string,
  summary: string,
  entity?: { entity_type?: string; entity_id?: string; metadata?: Record<string, unknown> },
) {
  if (!matter_id) return;
  await supabase.from("matter_activity").insert({
    matter_id,
    actor_id: userId,
    action,
    summary,
    entity_type: entity?.entity_type ?? null,
    entity_id: entity?.entity_id ?? null,
    metadata: entity?.metadata ?? {},
  });
}

/** Résout les noms des utilisateurs référencés par les colonnes indiquées. */
export async function resolveActorNames(
  supabase: Sb,
  rows: Record<string, any>[],
  fields: string[],
): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const r of rows) for (const f of fields) if (r?.[f]) ids.add(r[f]);
  if (ids.size === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", Array.from(ids));
  const map: Record<string, string> = {};
  for (const p of data ?? []) map[p.id] = p.full_name ?? "Utilisateur";
  return map;
}

/** Ajoute `<field>_name` à chaque ligne (ex. owner_id → owner_name). */
export async function withActorNames<T extends Record<string, any>>(
  supabase: Sb,
  rows: T[],
  mapping: Record<string, string>,
): Promise<(T & Record<string, string | null>)[]> {
  const names = await resolveActorNames(supabase, rows, Object.keys(mapping));

  return rows.map((r) => {
    const extra: Record<string, string | null> = {};
    for (const [field, alias] of Object.entries(mapping)) {
      extra[alias] = r[field] ? (names[r[field]] ?? null) : null;
    }
    return { ...r, ...extra };
  });
}
