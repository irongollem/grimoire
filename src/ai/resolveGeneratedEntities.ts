/**
 * App-side half of #600: the AI returns campaign-entity *names* on a
 * generated result (quest hooks, roll tables), not ids. This resolves each
 * name against the DM's own NPCs/locations/factions to build real chip data
 * for the generator panel.
 *
 * Mirrors the #337/#595 resolution-guard principle from
 * resolveGeneratedCombatants: an unmatched name is NEVER dropped. It comes
 * back with `id: null` so the panel can offer "create this" instead of
 * silently losing what the model wrote.
 */
export interface ResolvedEntity {
  kind: "npc" | "location" | "faction";
  name: string;
  id: string | null;
}

interface EntityPoolRow {
  id: string;
  name: string;
}

export interface EntityPools {
  npcs: EntityPoolRow[];
  locations: EntityPoolRow[];
  factions: EntityPoolRow[];
}

/** Trim + lowercase, first pool entry with a given name wins on a collision. */
function buildNameIndex(pool: EntityPoolRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const entity of pool) {
    const key = entity.name.trim().toLowerCase();
    if (!index.has(key)) index.set(key, entity.id);
  }
  return index;
}

function resolveKind(
  kind: ResolvedEntity["kind"],
  names: string[] | undefined,
  pool: EntityPoolRow[],
  seen: Set<string>,
  out: ResolvedEntity[],
): void {
  if (!names || names.length === 0) return;
  const nameIndex = buildNameIndex(pool);

  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;

    const dedupeKey = `${kind}:${name.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({ kind, name, id: nameIndex.get(name.toLowerCase()) ?? null });
  }
}

export function resolveGeneratedEntities(
  refs: { npcs?: string[]; locations?: string[]; factions?: string[] },
  pools: EntityPools,
): ResolvedEntity[] {
  const out: ResolvedEntity[] = [];
  const seen = new Set<string>();

  resolveKind("npc", refs.npcs, pools.npcs, seen, out);
  resolveKind("location", refs.locations, pools.locations, seen, out);
  resolveKind("faction", refs.factions, pools.factions, seen, out);

  return out;
}
