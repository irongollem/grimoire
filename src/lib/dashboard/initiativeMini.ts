import type { EncounterState, RunCombatant } from "@/types/encounter.types";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import { stepTurnIndex } from "@/rules/encounterCombatLogic";

/**
 * HP-state bucket for a mini-tracker row.
 *
 * Three buckets rather than a raw percentage: the widget is a glance, not the
 * runner, so the DM should read "this one is in trouble" without doing
 * arithmetic on two numbers mid-fight. `downed` is drawn at exactly the same
 * `hp <= 0` boundary `findFirstActiveIndex`/`stepTurnIndex` use to decide who
 * still gets a turn (`src/rules/encounterCombatLogic.ts:46-71`) — a second HP
 * threshold here that disagreed with the one the turn engine already applies
 * would make "downed" mean two different things on the same card.
 */
export type CombatantHpState = "healthy" | "bloodied" | "downed";

export interface InitiativeMiniRow {
  instanceId: string;
  name: string;
  type: RunCombatant["type"];
  /** `null` = not yet rolled. Displayed, never coerced — see `RunnerInitiativeField`. */
  initiative: number | null;
  hp: number;
  maxHp: number;
  hpState: CombatantHpState;
  /** This is `active_combatant_index`'s combatant — whose turn it is right now. */
  isActive: boolean;
  /** Who `nextTurn()` would land on. Never true on the active row itself. */
  isNext: boolean;
}

export interface InitiativeMiniState {
  round: number;
  encounterId: string;
  rows: InitiativeMiniRow[];
}

function deriveHpState(hp: number, maxHp: number): CombatantHpState {
  if (hp <= 0) return "downed";
  // A not-yet-populated `maxHp` (<= 0) would make the ratio below meaningless
  // (and, at exactly 0, a division by zero) rather than merely inaccurate —
  // read that as "healthy" instead of letting a malformed row poison the
  // bucket for a combatant who isn't actually in danger.
  if (maxHp > 0 && hp <= maxHp / 2) return "bloodied";
  return "healthy";
}

/**
 * Turns one `EncounterState` row into the mini-tracker's rows, or `null` when
 * there is nothing worth showing. `null` is the widget's entire self-hiding
 * contract (see `InitiativeMiniWidget.vue`): every early return here is a
 * dashboard that renders no card at all, never an empty one.
 *
 * Ordering and turn math are both delegated rather than re-derived: `sorted`
 * comes from `sortCombatantsByInitiative` (`src/rules/combatantSort.ts`) —
 * the exact comparator the runner, the player stats panel and the player
 * battle map all use, which is what makes `active_combatant_index` mean the
 * same row everywhere — and "who's next" comes from the runner's own
 * `stepTurnIndex` (`src/rules/encounterCombatLogic.ts:56-71`), wrapping
 * included. Re-implementing either here would risk this card quietly
 * disagreeing with the runner about whose turn it visibly is, which is worse
 * than not showing a mini-tracker at all.
 */
export function deriveInitiativeMiniState(state: EncounterState | null): InitiativeMiniState | null {
  if (!state || !state.is_running) return null;
  const combatants = state.combatants_live;
  if (!combatants || combatants.length === 0) return null;

  const sorted = sortCombatantsByInitiative(combatants);

  // Defensive clamp, not a `?? 0`: `active_combatant_index` is always in
  // range on the runner's own screen, but this card reads a realtime copy of
  // the row on a *different* screen, and a push racing a `removeCombatant`
  // splice could momentarily hand this widget an index one past the end of a
  // now-shorter list. Clamping keeps the highlight on a real row instead of
  // indexing undefined and crashing the dashboard over a one-tick race.
  const activeIndex = Math.min(Math.max(state.active_combatant_index, 0), sorted.length - 1);

  // `stepTurnIndex` walks the same "who can still act" rule as the runner:
  // alive monsters, or any player (a downed player still gets a turn to roll
  // death saves). It is also where the wrap happens — stepping past the last
  // alive combatant returns index 0, which is the case the brief calls out
  // by name and the reason this isn't hand-rolled here.
  const step = stepTurnIndex(sorted, activeIndex, 1);
  const nextInstanceId = step ? sorted[step.sortedIndex]?.instance_id : null;

  const rows: InitiativeMiniRow[] = sorted.map((c, index) => ({
    instanceId: c.instance_id,
    name: c.name,
    type: c.type,
    initiative: c.initiative,
    hp: c.hp,
    maxHp: c.max_hp,
    hpState: deriveHpState(c.hp, c.max_hp),
    isActive: index === activeIndex,
    // Excludes the active row itself: with exactly one combatant left able to
    // act, `stepTurnIndex` steps back to that same index (nowhere else to
    // go), and a single row cannot be both "now" and "next" at once.
    isNext: index !== activeIndex && c.instance_id === nextInstanceId,
  }));

  return { round: state.current_round, encounterId: state.encounter_id, rows };
}
