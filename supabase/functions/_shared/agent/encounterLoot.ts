import type { FightState } from "./fight.ts";
import { isRecord, UUID_RE } from "./parse.ts";

/**
 * The loot notes on an encounter, as things lying where it was fought.
 *
 * A Dungeon Master reads an encounter's loot (`encounters.item_ids`, `reward_currency_pools`) and drops it to the
 * chat by hand when the fight is won. Nobody sits in that chair at the AI table, so a fight fought out there lays
 * its loot in the room as ordinary placed loot (`loot_placements`, source `encounter_loot`): the narrator then sees
 * it under "Placed within reach", with who has it, and it is found and taken once, like anything else placed.
 */
export interface LootRow {
  kind: "item" | "currency";
  item_id: string | null;
  library_item_id: string | null;
  quantity: number;
  label: string;
  payload: { coins?: Record<string, number>; held: LootHeld; fight: string };
}

/**
 * Who has an encounter's loot once the fight is over. It is not lying on the floor: it is on the bodies of the
 * fallen, to be found by going through them, or still on those who gave in, who are alive and in the room and
 * hand it over or are searched (the maintainer, 18 Nov 2026: "ransacking a defeated enemy corpse is a thing").
 */
export type LootHeld = "fallen" | "yielded";

/** More than this on one encounter is a mistake in the data, not treasure. */
export const MAX_LOOT_ROWS = 40;

/**
 * The rows an encounter's loot notes come to. An item named twice is two of it (that is how the encounter editor
 * counts); an id that is not a uuid names a shared library item; a purse with no coins in it is not a purse.
 */
export function encounterLootRows(itemIds: unknown, pools: unknown, held: LootHeld, fight: string): LootRow[] {
  const counts = new Map<string, number>();
  if (Array.isArray(itemIds)) {
    for (const id of itemIds) {
      if (typeof id !== "string" || id.trim() === "") continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const rows: LootRow[] = [...counts].map(([id, quantity]) => ({
    kind: "item",
    item_id: UUID_RE.test(id) ? id : null,
    library_item_id: UUID_RE.test(id) ? null : id,
    quantity,
    label: "",
    payload: { held, fight },
  }));
  if (Array.isArray(pools)) {
    for (const pool of pools) {
      if (!isRecord(pool) || !isRecord(pool.coins)) continue;
      const coins: Record<string, number> = {};
      for (const [key, count] of Object.entries(pool.coins)) {
        if (typeof count === "number" && Number.isInteger(count) && count > 0) coins[key] = count;
      }
      if (Object.keys(coins).length === 0) continue;
      rows.push({ kind: "currency", item_id: null, library_item_id: null, quantity: 1, label: typeof pool.label === "string" ? pool.label.trim() : "", payload: { coins, held, fight } });
    }
  }
  return rows.slice(0, MAX_LOOT_ROWS);
}

/**
 * Whether a fight left its loot behind for the party: it is over, there were foes, and none of them is standing.
 * A fight the party lost or ran from leaves its loot with whoever still holds it.
 */
export function lootIsWon(fight: FightState | null): boolean {
  if (fight === null || fight.phase !== "over") return false;
  const foes = fight.fighters.filter((f) => f.side === "enemy");
  return foes.length > 0 && foes.every((f) => f.hp <= 0);
}
