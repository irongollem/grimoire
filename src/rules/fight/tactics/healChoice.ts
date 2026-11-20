// Choosing to heal (#1021): when a creature that can cast a healing spell does, and at whom. Pure and edge-importable
// (relative `.ts` imports only).
//
// APP CONVENTION throughout (the books say what a heal does, not when a creature the app plays casts it), the maintainer's
// order: "heal an ally who is down first (getting them up beats a little damage), then one below half".
//
// RULE heal-down: a creature with a heal that reaches someone on its side who is at 0 hit points and alive casts it, before any
// attack or damage spell: a character back on their feet acts again, and a dying one is a turn from death.
// RULE heal-low: failing that, a heal that reaches someone below half their hit points is cast before an attack.
// A scratch (above half) is never healed: that is no use of a spell. A heal never aims at a foe (`healTargeting.ts`).
// RULE heal-best: among the heals that qualify, the one reaching the most who are down, then the most below half, then the most
// hit points restored (what each regains, capped by what it is missing), then the cheaper slot (the lower level), then the first listed.
// RULE heal-bonus-action (PHB 2014 ch. 10 "Casting a Spell", "Bonus Action"; PHB 2024 "Bonus Action Spells": a creature that casts a
// spell with a Bonus Action casts no other spell that turn, except a cantrip with a casting time of one action): a Bonus Action heal
// (Healing Word) is no turn of its own. It rides the turn the picker chose, before it, as a Bonus Action feature does
// (`bonusAction.ts`), and when the chosen turn is a cast of a leveled spell, that spell stands and the heal does not, unless someone is
// down: then the leveled casts are left out of the choice, because getting them up comes first.

import type { RunCombatant } from "../../../types/encounter.types.ts";
import type { TurnOption, TurnOptionHeal } from "../terrain/options/types.ts";

export type HealOption = TurnOption & { heal: TurnOptionHeal };

export const isHealOption = (o: TurnOption): o is HealOption => o.kind === "heal" && o.heal !== undefined && o.heal !== null;

/** A leveled cast: a slot spell or an at-will spell above a cantrip. */
function castsALeveledSpell(o: TurnOption): boolean {
  // A cast Action Surge carries on is a leveled cast when either of its two actions is (`surgeCast.ts`).
  if (o.kind === "spell") return o.spell !== undefined && o.spell !== null && (o.spell.castLevel > 0 || (o.spell.surge !== undefined && castsALeveledSpell(o.spell.surge.second)));
  if (o.kind === "heal") return o.heal !== undefined && o.heal !== null && o.heal.castLevel > 0;
  return false;
}

/**
 * What a heal is worth to compare: hit points it restores, over those it reaches, each capped by what it is missing. A pool spell
 * (Mass Heal) restores what the targets miss, to the pool's end.
 */
function restored(o: HealOption, byId: ReadonlyMap<string, RunCombatant>): number {
  const pool = o.heal.pool;
  const missing = (id: string): number => {
    const t = byId.get(id);
    return t === undefined ? 0 : Math.max(0, t.max_hp - Math.max(0, t.hp));
  };
  if (o.heal.full === true) return o.heal.targetIds.reduce((sum, id) => sum + missing(id), 0);
  if (typeof pool === "number") return Math.min(pool, o.heal.targetIds.reduce((sum, id) => sum + missing(id), 0));
  return o.heal.targetIds.reduce((sum, id) => sum + Math.min(o.heal.expectedEach, missing(id)), 0);
}

function qualifying(options: readonly TurnOption[], slot: HealOption["heal"]["slot"]): HealOption[] {
  return options.filter(isHealOption).filter((o) => o.heal.slot === slot && (o.heal.downIds.length > 0 || o.heal.lowIds.length > 0));
}

function best(candidates: readonly HealOption[], combatants: readonly RunCombatant[]): HealOption | null {
  if (candidates.length === 0) return null;
  const byId = new Map(combatants.map((c) => [c.instance_id, c]));
  return [...candidates]
    .map((o, order) => ({ o, order }))
    .sort((a, b) =>
      b.o.heal.downIds.length - a.o.heal.downIds.length
      || b.o.heal.lowIds.length - a.o.heal.lowIds.length
      || restored(b.o, byId) - restored(a.o, byId)
      || a.o.heal.castLevel - b.o.heal.castLevel
      || a.order - b.order)[0].o;
}

/** Why this cast, in one sentence, from who needs it. */
export function healReason(o: HealOption, combatants: readonly RunCombatant[]): string {
  const nameOf = (id: string) => combatants.find((c) => c.instance_id === id)?.name ?? id;
  const level = o.heal.castLevel > 0 ? ` (level ${o.heal.castLevel})` : "";
  const down = o.heal.downIds;
  const who = (ids: string[]) => ids.map(nameOf).join(" and ");
  const why = down.length > 0 ? `${who(down)} ${down.length === 1 ? "is" : "are"} down at 0 hit points` : `${who(o.heal.lowIds)} ${o.heal.lowIds.length === 1 ? "is" : "are"} below half ${o.heal.lowIds.length === 1 ? "its" : "their"} hit points`;
  const spent = o.heal.spends ? ` and spends a ${o.heal.castLevel > 0 ? `level ${o.heal.castLevel} slot` : "use"}` : "";
  return `Casts ${o.heal.name}${level} to heal ${who(o.heal.targetIds)}: ${why}${spent}.`;
}

/**
 * The Action heal a creature casts as its turn, or null (RULE heal-down, heal-low, heal-best). Down comes before low: `best` ranks by
 * who is down first, so a heal that reaches someone down is chosen over any heal that reaches only the low.
 */
export function chooseActionHeal(options: readonly TurnOption[], combatants: readonly RunCombatant[]): { option: HealOption; reason: string } | null {
  const chosen = best(qualifying(options, "action"), combatants);
  return chosen === null ? null : { option: chosen, reason: healReason(chosen, combatants) };
}

export interface BonusHeal {
  option: HealOption;
  reason: string;
  /** Someone is down: the turn the picker chooses is picked without a leveled cast, because the heal is a Bonus Action spell (RULE heal-bonus-action). */
  someoneDown: boolean;
}

/** The Bonus Action heal that rides this turn, or null (RULE heal-bonus-action). Chosen before the turn is, so it can say what the turn may not be. */
export function chooseBonusHeal(options: readonly TurnOption[], combatants: readonly RunCombatant[], mover: RunCombatant): BonusHeal | null {
  if (mover.bonus_used === true || mover.hp <= 0) return null;
  const chosen = best(qualifying(options, "bonus_action"), combatants);
  return chosen === null ? null : { option: chosen, reason: healReason(chosen, combatants), someoneDown: chosen.heal.downIds.length > 0 };
}

/** The options a turn may be chosen among once a Bonus Action spell is to be cast: no leveled cast (an Action heal included), since only a cantrip may go with it. */
export function withoutLeveledCasts(options: readonly TurnOption[]): TurnOption[] {
  const left = options.filter((o) => !castsALeveledSpell(o));
  return left.length > 0 ? left : [...options];
}

/** Whether the turn the picker chose is a leveled cast, which a Bonus Action heal then does not ride with. */
export const isLeveledCast = castsALeveledSpell;
