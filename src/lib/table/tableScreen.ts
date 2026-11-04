// What the Table screen shows (#1125 decision 15): the fight in the players' eyes. The DM's window holds the whole
// live row, so the rules `get_player_encounter_state` applies on the server are applied again here, on the client:
// hidden monsters are left out, unseen ones become "???" and monster hit points are never drawn. Which squares and
// tokens the party can see is `lib/battlemap/partySight.ts`. Pure functions; the screen only draws what they return.
// Parity: the server side is `get_player_encounter_state` (latest in 20261103093423_every_creature_takes_its_size.sql),
// pinned by supabase/tests/player_encounter_state.test.sql. Change one, change the other and the matching tests.
// One deliberate difference: the server still sends a revealed monster's real hit points (the player portal draws
// them); the table is a shared screen that never draws them, so it keeps only "down or not".

import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import type { RunCombatant } from "@/types/encounter.types";
import type { NpcListRow } from "@/types/npc.types";

export type DisguisableNpc = Pick<
  NpcListRow,
  "id" | "disguise_name" | "disguise_portrait_url" | "disguise_portrait_focal_point" | "is_revealed"
>;

/** The name players are given for a creature they have not seen. */
export const UNSEEN_NAME = "???";

/** One creature as the table may see it, or null when the table may not know it exists. */
function asTheTableSees(c: RunCombatant, npcs: ReadonlyMap<string, DisguisableNpc>): RunCombatant | null {
  if (c.type === "player") return { ...c, ac: "", curses: [] };
  const state = c.reveal_state ?? "hidden";
  if (state === "hidden") return null;
  // Hit points are never drawn on the table; only "down or not" survives, because a dead token is drawn dead.
  const base: RunCombatant = { ...c, hp: c.hp > 0 ? 1 : 0, max_hp: 1, temp_hp: 0, ac: "", curses: [], conditions: [] };
  if (state === "unseen") {
    // Server: an unseen monster is always hp 1/1 (it never reads as fallen), no death saves, dex_mod 0.
    return {
      ...base,
      hp: 1,
      death_saves: { successes: 0, failures: 0 },
      dex_mod: 0,
      initiative_bonus: undefined,
      party_member_id: undefined,
      companion_id: undefined,
      name: UNSEEN_NAME,
      portrait_url: null,
      portrait_focal_point: null,
      token_url: null,
      monster_id: undefined,
      npc_id: undefined,
      wildshape: undefined,
    };
  }
  const npc = c.npc_id ? npcs.get(c.npc_id) : undefined;
  if (!npc || npc.is_revealed) return base;
  // A concealed NPC wears its disguise, exactly as the server swaps it for a player.
  const portrait = npc.disguise_portrait_url;
  return {
    ...base,
    name: npc.disguise_name ?? c.name,
    ...(portrait
      ? { portrait_url: portrait, portrait_focal_point: npc.disguise_portrait_focal_point ?? null, token_url: null }
      : {}),
  };
}

/** Everyone the table may know about, in the order the live row keeps them. Fog is not applied: initiative lists them anyway. */
export function tableVisible(combatants: readonly RunCombatant[], npcs: readonly DisguisableNpc[]): RunCombatant[] {
  const byId = new Map(npcs.map((n) => [n.id, n] as const));
  return combatants.flatMap((c) => {
    const seen = asTheTableSees(c, byId);
    return seen ? [seen] : [];
  });
}

/** The ribbon: the visible creatures in turn order. */
export function tableOrder(visible: readonly RunCombatant[]): RunCombatant[] {
  return sortCombatantsByInitiative([...visible]);
}

export interface TableTurn {
  eyebrow: string;
  /** Null when whoever is up is not something the table knows about. */
  title: string | null;
}

/** "Round 3" and "Brakka's turn". An unseen creature's turn names no one. */
export function tableTurn(round: number, active: RunCombatant | null): TableTurn {
  const eyebrow = `Round ${round}`;
  if (!active) return { eyebrow, title: null };
  return { eyebrow, title: active.name === UNSEEN_NAME ? "An unseen creature's turn" : `${active.name}'s turn` };
}

// ── Exploring ───────────────────────────────────────────────────────────────

/** The middle of where the party stands, for the screen to keep in view. Null when nobody has a square yet. */
export function partyCentre(party: readonly Pick<RunCombatant, "position">[]): { x: number; y: number } | null {
  const placed = party.flatMap((c) => (c.position ? [c.position] : []));
  if (placed.length === 0) return null;
  return {
    x: placed.reduce((sum, p) => sum + p.x, 0) / placed.length,
    y: placed.reduce((sum, p) => sum + p.y, 0) / placed.length,
  };
}
