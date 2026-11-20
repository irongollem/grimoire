import { footprintCells } from "@/lib/battlemap/partySight";
import type { FogCellKey } from "@/lib/battlemap/fogMask";
import { disengagedCondition, dodgingCondition, HIDDEN, hiddenCondition, hiddenFromPlayers } from "@/rules/fight/stances";
import { areHostile } from "@/rules/fight/sides";
import { hideOutcome, searchFinds, type HideOutcome } from "@/rules/hide";
import type { RulesetKey } from "@/types/ruleset.types";
import type { AppliedCondition } from "@/types/condition.types";
import type { FactionDef, RunCombatant } from "@/types/encounter.types";

/** The five actions the turn's buttons name, besides attacking. */
export type ActKind = "dash" | "dodge" | "disengage" | "hide" | "search";

/** How far a search reaches: the book gives no range, so the table takes the 60 feet its senses and the map's rooms assume. */
export const SEARCH_REACH_FEET = 60;

/**
 * What one of those actions does for the played character, beyond spending the Action: the line for the story,
 * whether the turn's speed doubles, and the condition they carry until their next turn. The board carries it out.
 * Hide is not decided here: it is a Stealth roll the board asks for first (`SoloFightBoard.onHide`), so its entry
 * is only there to keep the four kinds whole.
 */
export function actOutcome(kind: ActKind, name: string): { line: string; dashes: boolean; stance: AppliedCondition | null } {
  switch (kind) {
    case "dash":
      return { line: `${name} takes the Dash action`, dashes: true, stance: null };
    case "dodge":
      // PHB 2014 "Dodge": until your next turn, attacks against you have disadvantage and you save on Dexterity with advantage.
      return { line: `${name} takes the Dodge action: attacks against them have disadvantage until their next turn`, dashes: false, stance: dodgingCondition() };
    case "disengage":
      // PHB 2014 "Disengage": your movement provokes no opportunity attacks for the rest of the turn.
      return { line: `${name} takes the Disengage action: their movement provokes no opportunity attacks this turn`, dashes: false, stance: disengagedCondition() };
    case "hide":
      return { line: `${name} tries to hide`, dashes: false, stance: null };
    case "search":
      // Like Hide it is a roll the board asks for first (`SoloFightBoard.onSearch`).
      return { line: `${name} searches`, dashes: false, stance: null };
  }
}

/** Feet between two creatures' squares by the book's count (5 ft a square, diagonals included), from their top-left corners. */
function feetBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.round(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))) * 5;
}

/**
 * The passive Perception of every foe of the hider that can see them now: the watchers 2014's Hide is weighed against.
 * `passiveOf` reads a foe's passive from its stat block; a foe it cannot score is left out rather than guessed at.
 */
export function watchersOf(input: {
  hider: Pick<RunCombatant, "instance_id" | "faction_id">;
  combatants: readonly RunCombatant[];
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[];
  sight: ReadonlySet<FogCellKey>;
  passiveOf: (c: RunCombatant) => number | null;
}): number[] {
  const out: number[] = [];
  for (const c of input.combatants) {
    if (c.instance_id === input.hider.instance_id || c.hp <= 0 || !c.position) continue;
    if (!areHostile(input.factions, input.hider.faction_id, c.faction_id)) continue;
    // A foe stands where the hider can see it; one in the dark behind a wall cannot be watching them.
    if (!footprintCells({ ...c, position: c.position }).some((k) => input.sight.has(k))) continue;
    const passive = input.passiveOf(c);
    if (passive !== null) out.push(passive);
  }
  return out;
}

/**
 * What a Search (a Wisdom (Perception) check as the Action) finds: every foe within 60 feet that holds Hidden and whose
 * total this check meets (2024) or beats (2014). `found` loses Hidden; the line says who was found.
 */
export function searchOutcome(input: {
  total: number;
  name: string;
  searcher: Pick<RunCombatant, "instance_id" | "position">;
  combatants: readonly RunCombatant[];
  ruleset: RulesetKey;
}): { found: RunCombatant[]; line: string } {
  const at = input.searcher.position;
  const found = input.combatants.filter((c) => {
    if (c.instance_id === input.searcher.instance_id || !hiddenFromPlayers(c)) return false;
    if (at && c.position && feetBetween(at, c.position) > SEARCH_REACH_FEET) return false;
    const held = c.conditions.find((cond) => cond.name === HIDDEN);
    return held !== undefined && searchFinds(input.total, held, input.ruleset);
  });
  const line =
    found.length === 0
      ? `Perception ${input.total}: nothing stirs.`
      : `Perception ${input.total}: ${input.name} finds ${found.map((c) => c.name).join(", ")}.`;
  return { found, line };
}

/**
 * What the played character's Hide does: the book's outcome for the Stealth total, and the Hidden condition carrying that
 * total so a later search (and every other screen) can read it. In 2014 the foes that can see them are the watchers whose
 * passive Perception may notice them at once; in 2024 the DC is fixed and the watchers are not read.
 */
export function hideAction(input: {
  total: number;
  ruleset: RulesetKey;
  hider: Pick<RunCombatant, "instance_id" | "faction_id">;
  combatants: readonly RunCombatant[];
  factions: readonly Pick<FactionDef, "id" | "hostile_to">[];
  sight: ReadonlySet<FogCellKey>;
  passiveOf: (c: RunCombatant) => number | null;
}): { outcome: HideOutcome; condition: AppliedCondition | null } {
  const watchers = input.ruleset === "2024" ? null : watchersOf(input);
  const outcome = hideOutcome(input.total, input.ruleset, watchers);
  return { outcome, condition: outcome.hidden ? hiddenCondition(input.total) : null };
}
