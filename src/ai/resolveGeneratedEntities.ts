import type { QuestHookResult } from "@/ai/types";

/**
 * App-side half of #600: the AI returns campaign-entity *names* on a quest
 * hook, not ids. This resolves each name against the DM's own NPCs/
 * locations/factions to build real chip data for the generator panel.
 *
 * Mirrors the #337/#595 resolution-guard principle from
 * resolveGeneratedCombatants: an unmatched name is NEVER dropped. It comes
 * back with `id: null` so the panel can offer "create this" instead of
 * silently losing what the model wrote.
 */
export interface ResolvedQuestEntity {
  kind: "npc" | "location" | "faction";
  name: string;
  id: string | null;
}

interface EntityPoolRow {
  id: string;
  name: string;
}

export interface QuestEntityPools {
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
  kind: ResolvedQuestEntity["kind"],
  names: string[] | undefined,
  pool: EntityPoolRow[],
  seen: Set<string>,
  out: ResolvedQuestEntity[],
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

export function resolveQuestEntities(
  hook: Pick<QuestHookResult, "npcs" | "locations" | "factions">,
  pools: QuestEntityPools,
): ResolvedQuestEntity[] {
  const out: ResolvedQuestEntity[] = [];
  const seen = new Set<string>();

  resolveKind("npc", hook.npcs, pools.npcs, seen, out);
  resolveKind("location", hook.locations, pools.locations, seen, out);
  resolveKind("faction", hook.factions, pools.factions, seen, out);

  return out;
}
