// What a creature does with its turn, by rule (#1203): the gate that narrows the options to the ones its profile is
// offered, and a deterministic picker that gives its choice with a one-sentence reason.
//
// APP CONVENTION throughout, like `profile.ts`: the books do not say how a monster chooses. Each step is a small named
// rule so a maintainer can find and change it. A model that plays the creature gets the gated list and can ignore this
// pick; with no model, this is the whole decision.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { RunCombatant } from "../../../types/encounter.types.ts";
import { compareExposure, wayOffPhrase, type TurnOption, type TurnOptionSpell } from "../terrain/turnOptions.ts";
import type { MoraleRule, TacticalProfile } from "./profile.ts";
import { usableWayOut, type WayOut } from "./wayOut.ts";

export interface PickContext {
  combatants: readonly RunCombatant[];
  moverId: string;
  /** A target's armor class, or null when it is not known (the `lowest_armor` rule ranks it last). */
  armorClassOf: (target: RunCombatant) => number | null;
}

/** RULE near-best: how much of the best expected damage another option must reach to count as "as good" when a creature that fights from cover chooses (80%, so within 20%). */
const NEAR_BEST_SHARE = 0.8;

const RETREAT_KINDS = ["flee", "disengage", "dodge"] as const;

// ── morale ──────────────────────────────────────────────────────────────────────

/** RULE morale-break: broken at or below `breaksAt` of maximum hit points; a `breaksAt` of 0 never breaks. */
export function isBroken(profile: TacticalProfile, mover: RunCombatant): boolean {
  const { breaksAt } = profile.morale;
  return breaksAt > 0 && mover.max_hp > 0 && mover.hp / mover.max_hp <= breaksAt;
}

function surrenderOption(): TurnOption {
  return {
    id: "surrender",
    kind: "surrender",
    targetId: null,
    destination: null,
    path: null,
    feet: null,
    attack: null,
    distanceFeet: null,
    provokes: [],
    exposure: [],
    summary: "Surrender: drops its guard and yields",
  };
}

function escapeOption(way: WayOut): TurnOption {
  return {
    id: "escape",
    kind: "escape",
    targetId: null,
    destination: null,
    path: null,
    feet: null,
    attack: null,
    distanceFeet: null,
    provokes: [],
    exposure: [],
    escape: way,
    summary: way.effect === "leaves" ? `${way.name}: leaves the fight` : `${way.name}: turns Invisible`,
  };
}

const isInvisible = (mover: RunCombatant) => mover.conditions.some((c) => c.name.toLowerCase() === "invisible");

/** RULE surrender-unseen: a creature that yields but is already Invisible got unseen in order to get away, so it flees instead of giving up where it hides. */
function breaksInto(profile: TacticalProfile, mover: RunCombatant): MoraleRule["then"] {
  return profile.morale.then === "surrender" && isInvisible(mover) ? "flee" : profile.morale.then;
}

/**
 * RULE gate: drop every kind of turn the profile is not offered. Then, for a creature whose morale has broken:
 * `flee` keeps only flee, disengage and dodge (and leaves the list alone when none of those is there),
 * `surrender` replaces the list with the one synthetic Surrender (unless it is already Invisible, then it is gated
 * like `flee`), `fight_on` changes nothing. A flee or surrender that has a usable way out gets the synthetic Escape
 * in front. An empty list stays empty: a creature with no turn does not get to surrender or escape in it.
 */
export function gateOptions(options: readonly TurnOption[], profile: TacticalProfile, mover: RunCombatant): TurnOption[] {
  if (options.length === 0) return [];
  const offered = options.filter((o) => profile.offers.has(o.kind));
  if (!isBroken(profile, mover)) return offered;
  const then = breaksInto(profile, mover);
  let gated = offered;
  if (then === "surrender") {
    gated = [surrenderOption()];
  } else if (then === "flee") {
    const retreat = offered.filter((o) => (RETREAT_KINDS as readonly string[]).includes(o.kind));
    gated = retreat.length > 0 ? retreat : offered;
  }
  // RULE escape-first: a broken creature that runs or yields, and has a way out it can use now, uses it first. The
  // retreat (or the Surrender) stays in the list behind it, so a caller or a creature's note can still choose that.
  const way = then === "fight_on" ? null : usableWayOut(profile.wayOuts, mover);
  return way === null ? gated : [escapeOption(way), ...gated];
}

// ── choosing a target ───────────────────────────────────────────────────────────

interface Group {
  target: RunCombatant;
  options: TurnOption[];
  /** Position in the fight's combatant list: the last tie-break. */
  order: number;
  /** Feet to the target (the nearest of its options); null when nothing measured it. */
  distance: number | null;
}

function groupByTarget(options: readonly TurnOption[], ctx: PickContext, distanceOf: (o: TurnOption) => number | null): Group[] {
  const groups: Group[] = [];
  for (const option of options) {
    const order = ctx.combatants.findIndex((c) => c.instance_id === option.targetId);
    if (order < 0) continue;
    const distance = distanceOf(option);
    const known = groups.find((g) => g.order === order);
    if (known) {
      known.options.push(option);
      if (distance !== null && (known.distance === null || distance < known.distance)) known.distance = distance;
    } else {
      groups.push({ target: ctx.combatants[order], options: [option], order, distance });
    }
  }
  return groups;
}

const woundedShare = (c: RunCombatant) => (c.max_hp > 0 ? c.hp / c.max_hp : 1);
/** Compares numbers that may be unknown: unknown is last. */
const lastIfNull = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);

/**
 * RULE target: the `targets` setting chooses among the targets that have an option. `nearest` is the smallest distance;
 * `most_wounded` the lowest share of hit points; `spellcasters_first` a target holding a concentration spell, else
 * the most wounded; `lowest_armor` the lowest armor class, unknown last. Ties go to the earlier combatant in the fight.
 */
function chooseTarget(groups: readonly Group[], profile: TacticalProfile, ctx: PickContext): { group: Group; why: string } {
  const byRule = (a: Group, b: Group): number => {
    switch (profile.targets) {
      case "nearest":
        return lastIfNull(a.distance, b.distance);
      case "most_wounded":
        return woundedShare(a.target) - woundedShare(b.target);
      case "spellcasters_first": {
        const casting = Number(b.target.concentration !== undefined && b.target.concentration !== null) - Number(a.target.concentration !== undefined && a.target.concentration !== null);
        return casting !== 0 ? casting : woundedShare(a.target) - woundedShare(b.target);
      }
      case "lowest_armor":
        return lastIfNull(ctx.armorClassOf(a.target), ctx.armorClassOf(b.target));
    }
  };
  const group = [...groups].sort((a, b) => byRule(a, b) || a.order - b.order)[0];
  if (groups.length === 1) return { group, why: "the only enemy it can reach" };
  switch (profile.targets) {
    case "nearest":
      return { group, why: "the nearest enemy" };
    case "most_wounded":
      return { group, why: "the most wounded enemy" };
    case "spellcasters_first":
      return { group, why: group.target.concentration ? "an enemy holding a spell" : "the most wounded enemy" };
    case "lowest_armor":
      return { group, why: "the enemy with the weakest armor" };
  }
}

// ── choosing among one target's attacks ─────────────────────────────────────────

const isMultiattack = (o: TurnOption): boolean => o.attack !== null && o.attack.steps !== null;
const expectedOf = (o: TurnOption): number | null => (o.attack === null ? null : o.attack.expectedDamage);

/**
 * RULE attack: the highest expected damage (unknown counts lowest; when none is known a Multiattack first, then list
 * order). A trained or tactical creature skips an option that provokes an opportunity attack when another does not.
 * A creature that fights from cover picks, among the options within 20% of the best, the one with the best cover.
 */
function bestAttack(options: readonly TurnOption[], profile: TacticalProfile): TurnOption {
  let pool = [...options];
  if (profile.tier === "trained" || profile.tier === "tactical") {
    const clean = pool.filter((o) => o.provokes.length === 0);
    if (clean.length > 0) pool = clean;
  }
  const ranked = pool
    .map((option, index) => ({ option, index }))
    .sort((a, b) => {
      const ea = expectedOf(a.option);
      const eb = expectedOf(b.option);
      if (ea === null && eb === null) return Number(isMultiattack(b.option)) - Number(isMultiattack(a.option)) || a.index - b.index;
      // Unknown damage ranks below every known number.
      const rank = (e: number | null) => (e === null ? Number.NEGATIVE_INFINITY : e);
      return rank(eb) - rank(ea) || a.index - b.index;
    })
    .map((r) => r.option);
  const best = ranked[0];
  const bestExpected = expectedOf(best);
  if (profile.cover !== "fights_from" || bestExpected === null) return best;
  const near = ranked.filter((o) => {
    const e = expectedOf(o);
    return e !== null && e >= bestExpected * NEAR_BEST_SHARE;
  });
  return near.reduce((chosen, o) => (compareExposure(o.exposure, chosen.exposure) < 0 ? o : chosen), near[0]);
}

// ── choosing to cast ────────────────────────────────────────────────────────────

type SpellOption = TurnOption & { spell: TurnOptionSpell };
const isSpellOption = (o: TurnOption): o is SpellOption => o.kind === "spell" && o.spell !== undefined && o.spell !== null;
/** Unknown damage ranks below every known number. */
const rankOf = (e: number | null): number => (e === null ? Number.NEGATIVE_INFINITY : e);

/** Hit points left across a cast's targets: what a spent slot would be spent on. */
function hitPointsLeft(option: SpellOption, ctx: PickContext): number {
  return ctx.combatants.filter((c) => option.spell.targetIds.includes(c.instance_id)).reduce((sum, c) => sum + Math.max(0, c.hp), 0);
}

/**
 * The spell options a creature may choose among, and the target they are weighed for (#1021).
 *
 * RULE friends-in-the-fire (app convention, the maintainer's decision): a cast that catches any of its own side is never
 * chosen. A creature that does not care would be one whose stored tactics say so; `MonsterTactics` has no such field, so
 * none does, and no creature casts into its friends.
 *
 * RULE no-wasted-slot (app convention, the maintainer's decision: "it does not waste its top slot on something nearly
 * dead"): a cast that spends a slot or a use is not chosen when a free option the creature has this turn (any attack, or a
 * cantrip or at-will spell that catches no friend) is expected to deal at least the hit points the cast's targets have left.
 * Every attack counts as free: whether an attack is itself limited (a recharge, N per day) is not on the option.
 */
function castCandidates(spells: readonly SpellOption[], attacks: readonly TurnOption[], ctx: PickContext): SpellOption[] {
  const safe = spells.filter((o) => o.spell.friendsCaught.length === 0);
  const free = [...attacks.map(expectedOf), ...safe.filter((o) => !o.spell.spends).map((o) => o.spell.expectedDamage)].reduce<number>((best, e) => Math.max(best, rankOf(e)), Number.NEGATIVE_INFINITY);
  return safe.filter((o) => !(o.spell.spends && free >= hitPointsLeft(o, ctx)));
}

/**
 * RULE cast: the best cast on the chosen target, compared with the best attack by expected damage. A single-target spell
 * is compared only for the target the `targets` rule chose; an area spell whenever that target is among those it hits.
 * The higher number wins; a tie goes to the option that spends nothing, then to the attack (every attack counts as spending
 * nothing, as above), so a tie or two unknowns is the attack. With no attack to compare, the `targets` rule picks the
 * target among the casts.
 */
function bestCast(candidates: readonly SpellOption[], chosenAttack: { option: TurnOption; target: RunCombatant } | null, profile: TacticalProfile, ctx: PickContext): { option: SpellOption; why: string | null } | null {
  if (candidates.length === 0) return null;
  let target: RunCombatant;
  let why: string | null = null;
  if (chosenAttack !== null) {
    target = chosenAttack.target;
  } else {
    // One entry per creature each cast hits, so the `targets` rule can choose among them as it does among attacks.
    const entries = candidates.flatMap((o) => o.spell.targetIds.map((id): TurnOption => ({ ...o, targetId: id })));
    const picked = chooseTarget(groupByTarget(entries, ctx, (o) => (isSpellOption(o) ? o.spell.distanceFeet : null)), profile, ctx);
    target = picked.group.target;
    why = picked.why;
  }
  const onTarget = candidates.filter((o) => o.spell.targetIds.includes(target.instance_id));
  const ranked = onTarget
    .map((option, index) => ({ option, index }))
    .sort((a, b) => rankOf(b.option.spell.expectedDamage) - rankOf(a.option.spell.expectedDamage) || Number(a.option.spell.spends) - Number(b.option.spell.spends) || a.index - b.index);
  const best = ranked[0];
  if (best === undefined) return null;
  const spellE = best.option.spell.expectedDamage;
  if (chosenAttack !== null && rankOf(spellE) <= rankOf(expectedOf(chosenAttack.option))) return null;
  return { option: best.option, why };
}

function describeCast(option: SpellOption, why: string | null, ctx: PickContext, against: TurnOption | null): string {
  const { spell } = option;
  const nameOf = (id: string) => ctx.combatants.find((c) => c.instance_id === id)?.name ?? id;
  const names = spell.targetIds.map(nameOf);
  const who = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const level = spell.castLevel > 0 ? ` (level ${spell.castLevel})` : "";
  const reason = why !== null && names.length === 1 ? `, ${why}` : "";
  const base = `Casts ${spell.name}${level} at ${who}${reason}`;
  if (spell.expectedDamage === null) return `${base}.`;
  const hit = against === null || against.attack === null || against.attack.expectedDamage === null ? "" : `, against about ${Math.round(against.attack.expectedDamage)} from ${against.attack.action}`;
  const spent = spell.spends ? ` and spends a ${spell.castLevel > 0 ? `level ${spell.castLevel} slot` : "use"}` : "";
  return `${base}: about ${Math.round(spell.expectedDamage)} damage${hit}${spent}.`;
}

// ── the picker ──────────────────────────────────────────────────────────────────

export interface TurnPick {
  optionId: string;
  reason: string;
}

const RETREAT_VERB: Record<string, string> = { flee: "flees", disengage: "disengages", dodge: "dodges" };

function describeAttack(option: TurnOption, target: RunCombatant, why: string): string {
  const attack = option.attack;
  const action = attack === null ? "an attack" : attack.action;
  const hit = attack === null ? null : attack.hitChance;
  const damage = attack === null ? null : attack.expectedDamage;
  const base = `Attacks ${target.name}, ${why}, with ${action}`;
  if (hit === null || damage === null) return `${base}.`;
  return `${base}: ${Math.round(hit * 100)}% to hit for about ${Math.round(damage)} damage.`;
}

/**
 * The creature's choice from the (gated) options, deterministic, with a plain reason. Null only for an empty list.
 * Order: a broken creature escapes if it can, else retreats (or yields); a lone option is taken; otherwise it attacks the target its `targets`
 * rule picks with that target's best option; with no attack on offer it closes on a target, else it Dodges, else
 * takes the first option.
 */
export function pickTurn(options: readonly TurnOption[], profile: TacticalProfile, ctx: PickContext): TurnPick | null {
  if (options.length === 0) return null;
  const mover = ctx.combatants.find((c) => c.instance_id === ctx.moverId);
  const broken = mover !== undefined && isBroken(profile, mover);
  const find = (kind: string) => options.find((o) => o.kind === kind);

  if (mover !== undefined && broken) {
    const standing = `at ${mover.hp} of ${mover.max_hp} hit points it breaks`;
    const escape = find("escape");
    const way = escape?.escape;
    if (escape !== undefined && way !== undefined) {
      const how = way.effect === "leaves" ? `uses ${way.name} to leave the fight` : `uses ${way.name} to go unseen`;
      return { optionId: escape.id, reason: `Gets away: ${standing} and ${how}.` };
    }
    const then = breaksInto(profile, mover);
    if (then === "surrender") {
      const yields = find("surrender");
      if (yields) return { optionId: yields.id, reason: `Yields: ${standing} and surrenders.` };
    }
    if (then === "flee") {
      const retreat = find("flee") ?? find("disengage") ?? find("dodge");
      if (retreat) {
        const { exitKind, exitLabel } = retreat;
        const leaving = retreat.leavesMap === true && exitKind !== undefined && exitKind !== null
          ? `, leaving the map ${wayOffPhrase(exitKind, exitLabel === undefined ? null : exitLabel, true)}`
          : "";
        return { optionId: retreat.id, reason: `Falls back: ${standing} and ${RETREAT_VERB[retreat.kind]}${leaving}.` };
      }
    }
  }

  const attacks = options.filter((o) => o.kind === "attack");
  const attackChoice = attacks.length === 0 ? null : chooseTarget(groupByTarget(attacks, ctx, (o) => (o.attack === null ? null : o.attack.distanceFeet)), profile, ctx);
  const best = attackChoice === null ? null : { option: bestAttack(attackChoice.group.options, profile), target: attackChoice.group.target };
  const casts = options.filter(isSpellOption);
  if (casts.length > 0) {
    const cast = bestCast(castCandidates(casts, attacks, ctx), best, profile, ctx);
    if (cast !== null) return { optionId: cast.option.id, reason: describeCast(cast.option, cast.why !== null ? cast.why : attackChoice === null ? null : attackChoice.why, ctx, best === null ? null : best.option) };
  }
  if (attackChoice !== null && best !== null) return { optionId: best.option.id, reason: describeAttack(best.option, best.target, attackChoice.why) };
  // A cast that was ruled out is no turn to fall back on: what is left is judged without it, unless nothing else is on offer.
  const left = options.filter((o) => o.kind !== "spell");
  const turns = left.length > 0 ? left : options;
  if (turns.length === 1) return { optionId: turns[0].id, reason: `Takes the only turn on offer: ${turns[0].summary}.` };

  const approaches = turns.filter((o) => o.kind === "dash" || o.kind === "move");
  const closeIn = (): TurnPick | null => {
    if (approaches.length === 0) return null;
    const { group, why } = chooseTarget(groupByTarget(approaches, ctx, (o) => o.distanceFeet), profile, ctx);
    const chosen = group.options.reduce((a, o) => (lastIfNull(o.distanceFeet, a.distanceFeet) < 0 ? o : a), group.options[0]);
    const verb = chosen.kind === "dash" ? "Dashes" : "Moves";
    return { optionId: chosen.id, reason: `${verb} toward ${group.target.name}, ${why}: nothing it can attack is in reach this turn.` };
  };
  const dodge = turns.find((o) => o.kind === "dodge");
  const dodges = (): TurnPick | null => (dodge ? { optionId: dodge.id, reason: "Dodges: nothing it can attack is in reach this turn." } : null);
  // RULE close-before-dodge, for every role. An attack option already covers every square it could shoot or strike
  // from, so "no attack" means no such square is in reach this turn. A ranged creature that Dodged then would
  // stand still for the whole fight; it has to move to find a line like anyone else.
  for (const attempt of [closeIn, dodges]) {
    const pick = attempt();
    if (pick) return pick;
  }
  return { optionId: turns[0].id, reason: `Takes the first turn on offer: ${turns[0].summary}.` };
}
