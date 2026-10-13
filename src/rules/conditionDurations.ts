import type { AppliedCondition, TurnEdge } from "@/types/condition.types";
import type { DamageType } from "@/types/damage.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { SaveAbility } from "@/types/statBlock.types";
import { takesTurns } from "@/rules/encounterCombatLogic";

/**
 * Condition durations at the turn edges (#1018), as pure functions over a list
 * of combatants. The turn reducer (`encounterTurn`) calls `conditionsAtTurnEdge`
 * wherever it raises `turn_started` / `turn_ended`, and `endSourcedConditions`
 * when a source drops or stops concentrating. Nothing here touches Vue, the
 * clock or the dice: what is owed a roll is flagged (`due`) and announced as an
 * event, and the DM rolls it.
 *
 * Records are immutable. A combatant whose conditions do not change keeps its
 * object identity, and the same array comes back when nothing changed at all.
 */

export type ConditionEndReason = "expired" | "saved" | "concentration" | "source_down" | "source_removed";

export type ConditionEvent =
  | { type: "condition_ended"; instanceId: string; name: string; reason: ConditionEndReason }
  /** The bearer owes a repeat save against this condition now. */
  | { type: "condition_save_due"; instanceId: string; name: string; ability: SaveAbility; dc: number }
  /** The bearer takes this condition's ongoing damage now. */
  | { type: "ongoing_damage_due"; instanceId: string; name: string; dice: string; damageType: DamageType | null };

export interface ConditionPassResult {
  combatants: RunCombatant[];
  events: ConditionEvent[];
  /** Instance ids whose conditions changed. */
  changed: string[];
}

/**
 * The combatant whose turn a duration counts on, for a bearer `bearer` and a
 * condition `c`. `ids` holds only combatants that still get turns: a source
 * that is out of the fight or down (a monster at 0 HP is skipped) has no turn
 * left to count on, so the duration falls back to the bearer's turns rather
 * than lasting forever.
 */
function anchorOf(c: AppliedCondition, bearer: RunCombatant, ids: ReadonlySet<string>): string {
  const sourceId = c.source?.id;
  const sourceHere = sourceId !== undefined && ids.has(sourceId);
  if (c.ends?.kind === "turn") return c.ends.of === "source" && sourceHere ? sourceId : bearer.instance_id;
  // A save end with a round cap counts those rounds down like a rounds end (#1055).
  if (c.ends?.kind === "rounds" || (c.ends?.kind === "save" && c.ends.remaining !== undefined)) return sourceHere ? sourceId : bearer.instance_id;
  return bearer.instance_id;
}

/** Folds per-combatant condition rewrites back into the list, keeping identity where nothing changed. */
function applyRewrites(
  combatants: readonly RunCombatant[],
  rewrite: (b: RunCombatant, events: ConditionEvent[]) => AppliedCondition[],
): ConditionPassResult {
  const events: ConditionEvent[] = [];
  const changed: string[] = [];
  let touched = false;
  const next = combatants.map((b) => {
    const conditions = rewrite(b, events);
    if (conditions === b.conditions) return b;
    touched = true;
    changed.push(b.instance_id);
    return { ...b, conditions };
  });
  return { combatants: touched ? next : (combatants as RunCombatant[]), events, changed };
}

/**
 * Runs the hooks for one turn edge of combatant `instanceId`. Returns the same
 * array instance when nothing changed.
 *
 * Start edge: conditions ending "at the start of" the anchor's turn expire,
 * ones ending "at the end of" it are armed (so a condition applied during that
 * very turn survives its end), rounds tick down on the anchor's turns (a save
 * end's round cap, #1055, ticks the same way and lapses as "expired"), and
 * on the bearer's own start a save or ongoing damage set for the start falls
 * due. End edge: armed end-of-turn conditions expire, and on the bearer's own
 * end a save or ongoing damage set for the end falls due.
 */
export function conditionsAtTurnEdge(
  combatants: readonly RunCombatant[],
  edge: TurnEdge,
  instanceId: string,
): ConditionPassResult {
  const ids = new Set(combatants.filter(takesTurns).map((c) => c.instance_id));
  return applyRewrites(combatants, (b, events) => {
    let changed = false;
    const out: AppliedCondition[] = [];
    for (const c of b.conditions) {
      let rec: AppliedCondition = c;
      const ends = c.ends;
      let removed = false;
      const ended = () => {
        removed = true;
        events.push({ type: "condition_ended", instanceId: b.instance_id, name: c.name, reason: "expired" });
      };
      if (ends?.kind === "turn" && anchorOf(c, b, ids) === instanceId) {
        if (edge === "start" && ends.at === "start") ended();
        else if (edge === "start" && ends.at === "end" && !ends.armed) rec = { ...rec, ends: { ...ends, armed: true } };
        else if (edge === "end" && ends.at === "end" && ends.armed) ended();
      } else if (ends?.kind === "rounds" && edge === "start" && anchorOf(c, b, ids) === instanceId) {
        const remaining = ends.remaining - 1;
        if (remaining <= 0) ended();
        else rec = { ...rec, ends: { ...ends, remaining } };
      } else if (ends?.kind === "save" && ends.remaining !== undefined && edge === "start" && anchorOf(c, b, ids) === instanceId) {
        const remaining = ends.remaining - 1;
        if (remaining <= 0) ended();
        else rec = { ...rec, ends: { ...ends, remaining } };
      }
      if (removed) {
        changed = true;
        continue;
      }
      if (b.instance_id === instanceId) {
        // `rec.ends` rather than `ends`: a capped save end has just ticked down.
        const saveEnds = rec.ends;
        if (saveEnds?.kind === "save" && saveEnds.at === edge) {
          rec = withDue(rec, "save");
          events.push({ type: "condition_save_due", instanceId: b.instance_id, name: c.name, ability: saveEnds.ability, dc: saveEnds.dc });
        }
        if (c.ongoing && c.ongoing.at === edge) {
          rec = withDue(rec, "damage");
          events.push({
            type: "ongoing_damage_due",
            instanceId: b.instance_id,
            name: c.name,
            dice: c.ongoing.dice,
            damageType: c.ongoing.type,
          });
        }
      }
      if (rec !== c) changed = true;
      out.push(rec);
    }
    return changed ? out : b.conditions;
  });
}

function withDue(c: AppliedCondition, key: "save" | "damage"): AppliedCondition {
  return c.due?.[key] ? c : { ...c, due: { ...c.due, [key]: true } };
}

/**
 * Ends conditions on every combatant whose source is `sourceId` and that are
 * concentration-linked (`source.concentration`). With `spell`, only those whose
 * `source.spell` is that spell or unset. Unless `concentrationOnly`, it also
 * ends the ones a `turn` end anchors on the source (`of: "source"`), which have
 * nothing left to count on when the source leaves the fight.
 */
export function endSourcedConditions(
  combatants: readonly RunCombatant[],
  sourceId: string,
  reason: ConditionEndReason,
  opts: { spell?: string; concentrationOnly?: boolean } = {},
): ConditionPassResult {
  return applyRewrites(combatants, (b, events) => {
    const kept = b.conditions.filter((c) => {
      if (c.source?.id !== sourceId) return true;
      if (opts.spell !== undefined && c.source.spell !== undefined && c.source.spell !== opts.spell) return true;
      const linked = !!c.source.concentration;
      const anchored = !opts.concentrationOnly && c.ends?.kind === "turn" && c.ends.of === "source";
      if (!linked && !anchored) return true;
      events.push({ type: "condition_ended", instanceId: b.instance_id, name: c.name, reason });
      return false;
    });
    return kept.length === b.conditions.length ? b.conditions : kept;
  });
}

/** Whether `sourceId` holds a concentration-linked condition on some other combatant. */
export function holdsConcentration(combatants: readonly RunCombatant[], sourceId: string): boolean {
  return combatants.some(
    (c) => c.instance_id !== sourceId && c.conditions.some((x) => x.source?.id === sourceId && x.source.concentration === true),
  );
}
