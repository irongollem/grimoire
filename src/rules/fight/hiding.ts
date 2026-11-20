// Hiding and finding, as a fight plays them (#1021 row 13): who can be aimed at, who is watching a hider, who a search reaches.
// The dice and the conditions are `hide.ts` and `stances.ts`; this file only says which creatures each rule is about, so the
// options (what a creature may do) and the server (what it then does) agree. Pure and edge-importable.

import type { RunCombatant } from "../../types/encounter.types.ts";
import { combatantFootprint } from "../../lib/battlemap/tokenFootprint.ts";
import { HIDE_DC_2024, hideOutcome } from "../hide.ts";
import type { RulesetKey } from "../../types/ruleset.types.ts";
import { isIncapacitated, isHidden } from "./stances.ts";
import type { FightMap } from "./terrain/battleMap.ts";
import { coverBetween, distanceFeet, type Box } from "./terrain/sight.ts";

/**
 * RULE search-range (APP CONVENTION): the books give a search no distance (it is the DM's call what a creature could notice
 * from where it stands), so a search reaches a hidden creature within 60 feet, the range a creature is usually heard and seen at in a fight.
 */
export const SEARCH_RANGE_FEET = 60;

const placed = (c: RunCombatant): Box | null => (c.position === null || c.position === undefined ? null : { anchor: c.position, footprint: combatantFootprint(c) });

/**
 * RULE hidden-unaimable (PHB 2014 ch. 9 "Unseen Attackers and Targets": "if you are guessing the location of a hidden or unseen
 * target"; SRD 5.2 "Hide": the hider is unseen until found): a creature the rules play never aims an attack, a spell or an
 * opportunity attack at a hostile that holds Hidden, since where it is, is not known. What is left is the hostiles it can find.
 */
export function aimableHostiles<T extends RunCombatant>(hostiles: readonly T[]): T[] {
  return hostiles.filter((h) => !isHidden(h.conditions));
}

/**
 * The hidden hostiles a search from where the mover stands reaches. With no map, or a creature with no place, the distance is not
 * known and the creature is counted: a search is the one thing the mover can do about it.
 */
export function searchable(mover: RunCombatant, hostiles: readonly RunCombatant[]): RunCombatant[] {
  const here = placed(mover);
  return hostiles.filter((h) => {
    if (!isHidden(h.conditions)) return false;
    const there = placed(h);
    return here === null || there === null || distanceFeet(here, there) <= SEARCH_RANGE_FEET;
  });
}

/**
 * RULE hide-watchers (PHB 2014 ch. 7 "Hiding": a creature that can see you can see you; the Passive Perception rule compares the
 * scores of the creatures that could notice): the hostiles that could notice a creature now standing where `hider` is. A hostile is
 * a watcher when it is awake, is not itself hidden, and has some line to the hider (anything short of total cover). With no map
 * (or a hider with no place) every awake hostile watches.
 */
export function watchersOf(hider: RunCombatant, hostiles: readonly RunCombatant[], others: readonly RunCombatant[], map: FightMap | null): RunCombatant[] {
  const at = placed(hider);
  return hostiles.filter((h) => {
    if (h.hp <= 0 || isIncapacitated(h.conditions) || isHidden(h.conditions)) return false;
    if (map === null || at === null) return true;
    const from = placed(h);
    // A hostile with no place on a map is not on the board, so it sees nothing of it (the options leave it out the same way).
    if (from === null) return false;
    const screens = others.filter((o) => o.instance_id !== h.instance_id && o.instance_id !== hider.instance_id).flatMap((o) => placed(o) ?? []);
    return coverBetween(from, at, map.occluders, screens) !== "total";
  });
}

/**
 * What a Hide action's Stealth total did, in the words of the turn's reply. `watchers` are the creatures that could see the hider and
 * their passive Perception: in 2014 one at or above the total notices at once and is named; in 2024 only the DC 15 counts (`hideOutcome`).
 */
export function hideResult(name: string, total: number, ruleset: RulesetKey, watchers: readonly { name: string; passive: number }[]): { hidden: boolean; outcome: string } {
  const { hidden } = hideOutcome(total, ruleset, watchers.map((w) => w.passive));
  // The total of a successful hide is what a search must reach: the players read this line, so it is not told (the DM sees it
  // on the token's tooltip). A hide that failed or was noticed is in plain sight, so its total may be.
  if (hidden) return { hidden, outcome: `${name} hides.` };
  const noticing = ruleset === "2014" ? watchers.filter((w) => w.passive >= total).map((w) => w.name) : [];
  return {
    hidden,
    outcome: noticing.length > 0
      ? `${name} tries to hide but ${noticing.join(" and ")} ${noticing.length === 1 ? "notices" : "notice"} it (Stealth ${total}).`
      : `${name} tries to hide but fails (Stealth ${total}, DC ${HIDE_DC_2024}).`,
  };
}
