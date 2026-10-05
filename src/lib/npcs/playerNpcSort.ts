import { getNpcDisplayName } from "@/lib/npcDisplay";
import type { SortDir } from "@/lib/noteSort";
import type { PlayerNpc } from "@/types/npc.types";

export const PLAYER_NPC_SORT_FIELDS = ["rating", "revealed", "location", "name"] as const;
export type PlayerNpcSortField = (typeof PLAYER_NPC_SORT_FIELDS)[number];

/** The direction a field reads best in when first picked. */
export function defaultSortDir(field: PlayerNpcSortField): SortDir {
  switch (field) {
    case "rating":
    case "revealed":
      return "desc";
    case "location":
    case "name":
      return "asc";
  }
}

export interface PlayerNpcSortContext {
  getRating: (npcId: string) => number;
  /** The player-visible location name, or "" when there is none. */
  locationName: (npc: PlayerNpc) => string;
}

function cmpName(a: PlayerNpc, b: PlayerNpc): number {
  const nameA = getNpcDisplayName(a);
  const nameB = getNpcDisplayName(b);
  if (nameA && nameB) return nameA.localeCompare(nameB);
  return nameA ? -1 : nameB ? 1 : 0;
}

/**
 * Sort the People list. `dir` applies to the primary key only; every field
 * falls back to name ascending (nameless last), and entries with no value for
 * the primary key (no revealed_at, no visible location, no name) always go last.
 */
export function sortPlayerNpcs(
  npcs: readonly PlayerNpc[],
  field: PlayerNpcSortField,
  dir: SortDir,
  ctx: PlayerNpcSortContext,
): PlayerNpc[] {
  const sign = dir === "asc" ? 1 : -1;

  return [...npcs].sort((a, b) => {
    switch (field) {
      case "rating": {
        const diff = ctx.getRating(a.id) - ctx.getRating(b.id);
        if (diff !== 0) return diff * sign;
        return cmpName(a, b);
      }
      case "revealed": {
        const ra = a.revealed_at ?? null;
        const rb = b.revealed_at ?? null;
        if (ra && !rb) return -1;
        if (!ra && rb) return 1;
        if (ra && rb) {
          const diff = Date.parse(ra) - Date.parse(rb);
          if (diff !== 0) return diff * sign;
        }
        return cmpName(a, b);
      }
      case "location": {
        const la = ctx.locationName(a);
        const lb = ctx.locationName(b);
        if (la && !lb) return -1;
        if (!la && lb) return 1;
        if (la !== lb) return la.localeCompare(lb) * sign;
        const diff = ctx.getRating(b.id) - ctx.getRating(a.id);
        if (diff !== 0) return diff;
        return cmpName(a, b);
      }
      case "name": {
        // Nameless last in either direction, so only a named pair flips.
        const bothNamed = getNpcDisplayName(a) && getNpcDisplayName(b);
        return cmpName(a, b) * (bothNamed ? sign : 1);
      }
    }
  });
}
