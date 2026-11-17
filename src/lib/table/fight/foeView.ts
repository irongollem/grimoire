import type { FactionDef, RunCombatant } from "@/types/encounter.types";
import { healthWord } from "@/lib/encounters/healthWord";

export type SeenHealth =
  | { kind: "numbers"; hp: number; maxHp: number }
  | { kind: "word"; word: string };

export interface SeenCombatant {
  instanceId: string;
  name: string;
  isYou: boolean;
  side: "you" | "foe" | "other";
  /** In the room but not in the fight: listed apart from the turn order. */
  bystander: boolean;
  health: SeenHealth;
}

/** Whether two factions fight each other, read in either direction (hostility is not always declared on both). */
export function areHostile(
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[],
  a: string,
  b: string,
): boolean {
  if (a === b) return false;
  const hostileTo = (from: string, to: string) => factions.find((f) => f.id === from)?.hostile_to.includes(to) === true;
  return hostileTo(a, b) || hostileTo(b, a);
}

/**
 * The fight as the player's character sees it: their own hit points as numbers, everyone else as a word.
 * A hidden creature is not in the list at all; an unseen one is only "???". Order is kept.
 */
export function asThePlayerSees(
  combatants: readonly RunCombatant[],
  playedInstanceId: string,
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[],
): SeenCombatant[] {
  const played = combatants.find((c) => c.instance_id === playedInstanceId);
  const seen: SeenCombatant[] = [];
  for (const c of combatants) {
    if (c.reveal_state === "hidden") continue;
    const isYou = c.instance_id === playedInstanceId;
    const side: SeenCombatant["side"] = isYou
      ? "you"
      : c.bystander !== true && played !== undefined && areHostile(factions, played.faction_id, c.faction_id)
        ? "foe"
        : "other";
    if (c.reveal_state === "unseen") {
      seen.push({ instanceId: c.instance_id, name: "???", isYou, side, bystander: c.bystander === true, health: { kind: "word", word: "Unknown" } });
      continue;
    }
    seen.push({
      instanceId: c.instance_id,
      name: c.name,
      isYou,
      side,
      bystander: c.bystander === true,
      health: isYou ? { kind: "numbers", hp: c.hp, maxHp: c.max_hp } : { kind: "word", word: healthWord(c.hp, c.max_hp) },
    });
  }
  return seen;
}
