// What a creature does with its turn, by rule (#1203): the gate that narrows the options to the ones its profile is
// offered, and a deterministic picker that gives its choice with a one-sentence reason.
//
// APP CONVENTION throughout, like `profile.ts`: the books do not say how a monster chooses. Each step is a small named
// rule so a maintainer can find and change it. A model that plays the creature gets the gated list and can ignore this
// pick; with no model, this is the whole decision.
//
// Pure and edge-importable (relative `.ts` imports only).

import type { RunCombatant } from "../../../types/encounter.types.ts";
import { boonArmorClass } from "../boons.ts";
import { compareExposure } from "../terrain/options/scene.ts";
import { fleeSourceOf } from "../terrain/options/flee.ts";
import { wayOffPhrase } from "../terrain/options/phrases.ts";
import { type TurnOption, type TurnOptionSpell } from "../terrain/options/types.ts";
import type { MoraleRule, TacticalProfile } from "./profile.ts";
import { chooseActionBoon, isBoonOption } from "./boonChoice.ts";
import { chooseActionHeal, isHealOption } from "./healChoice.ts";
import { seenAs, seenDamagePerTurn } from "./shownThreat.ts";
import { usableWayOut, type WayOut } from "./wayOut.ts";

export interface PickContext {
  combatants: readonly RunCombatant[];
  moverId: string;
  /** The fight's current round: a boon is cast only early (`boonChoice.ts`); left out, none is. */
  round?: number;
  /** A target's armor class, or null when it is not known (the `lowest_armor` rule ranks it last). */
  armorClassOf: (target: RunCombatant) => number | null;
}

/** RULE near-best: how much of the best expected damage another option must reach to count as "as good" when a creature that fights from cover chooses (80%, so within 20%). */
const NEAR_BEST_SHARE = 0.8;

const RETREAT_KINDS = ["flee", "disengage", "dodge"] as const;
/** What a broken creature that would flee keeps: its retreats, and a try at breaking free of a hold, which has to come before any running (`break-free-first`). */
const FLEE_KEPT_KINDS: readonly string[] = [...RETREAT_KINDS, "break_free"];

/** Held in place by a condition: Restrained or Grappled (both set the speed to 0). The applied condition does not carry the speed a spell sets by other words, so those are not counted. */
const isHeld = (mover: RunCombatant): boolean => mover.conditions.some((c) => c.name === "Restrained" || c.name === "Grappled");

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
 * RULE gate: drop every kind of turn the profile is not offered (a break-free try counts as offered wherever an attack is). Then, for a creature whose morale has broken:
 * `flee` keeps only flee, disengage and dodge (and leaves the list alone when none of those is there),
 * `surrender` replaces the list with the one synthetic Surrender (unless it is already Invisible, then it is gated
 * like `flee`), `fight_on` changes nothing. A flee or surrender that has a usable way out gets the synthetic Escape
 * in front. An empty list stays empty: a creature with no turn does not get to surrender or escape in it.
 *
 * RULE flee-by-spell (app convention implementing SRD 5.1 Fear: "must take the Dash action and move away from you by the
 * safest available route on each of its turns, unless there is nowhere to move"): a creature bearing a condition whose source
 * says `mustFlee`, with that source still in the fight (`combatants`, which a caller that has no such creature may leave out),
 * is gated like a broken creature that flees: it keeps its retreats and a try at breaking free of a hold. Where it has no
 * flee option (nowhere to move) this leaves it Disengage or Dodge, never an attack or a cast: the text forces nothing then,
 * and a frightened creature does not turn on the one it flees. The way out (`escape-first`) stays tied to broken morale
 * alone: a turned creature runs, it does not Plane Shift home.
 */
export function gateOptions(options: readonly TurnOption[], profile: TacticalProfile, mover: RunCombatant, combatants: readonly RunCombatant[] = []): TurnOption[] {
  if (options.length === 0) return [];
  // A try at breaking free of a hold is offered at every tier that offers an attack: even an animal struggles (#1021).
  const offeredAll = options.filter((o) => profile.offers.has(o.kind) || (o.kind === "break_free" && profile.offers.has("attack")));
  const mustRun = fleeSourceOf(mover, combatants) !== null;
  const kept = mustRun ? offeredAll.filter((o) => FLEE_KEPT_KINDS.includes(o.kind)) : offeredAll;
  const offered = kept.length > 0 ? kept : offeredAll;
  if (!isBroken(profile, mover)) return offered;
  const then = breaksInto(profile, mover);
  let gated = offered;
  if (then === "surrender") {
    gated = [surrenderOption()];
  } else if (then === "flee") {
    const retreat = offered.filter((o) => FLEE_KEPT_KINDS.includes(o.kind));
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

/** 0 for a creature seen to be a caster, 1 for an archer, 2 for anything else: the order `spellcasters_first` hunts in. */
function huntRank(c: RunCombatant): number {
  const seen = seenAs(c);
  return seen.caster ? 0 : seen.archer ? 1 : 2;
}

const woundedShare = (c: RunCombatant) => (c.max_hp > 0 ? c.hp / c.max_hp : 1);
/** Compares numbers that may be unknown: unknown is last. */
const lastIfNull = (a: number | null, b: number | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a - b);

/** A target's armor class with its boons (Shield of Faith) on top; null stays null. */
function armorOf(target: RunCombatant, ctx: PickContext): number | null {
  const printed = ctx.armorClassOf(target);
  return printed === null ? null : printed + boonArmorClass(target.conditions);
}

/**
 * RULE target: the `targets` setting chooses among the targets that have an option. `nearest` is the smallest distance;
 * `most_wounded` the lowest share of hit points; `spellcasters_first` a target holding a concentration spell, else
 * the most wounded; `lowest_armor` the lowest armor class, unknown last. Ties go to the earlier combatant in the fight.
 *
 * RULE hunt-casters-and-archers (app convention, the maintainer: "intelligent monsters might actively hunt mages,
 * archers"): `spellcasters_first` prefers a target the fight has seen to be a caster (it has cast, or holds a concentration
 * spell), then one seen to be an archer, then the most wounded. Only what the fight has shown counts (`shownThreat.ts`).
 */
function chooseTarget(groups: readonly Group[], profile: TacticalProfile, ctx: PickContext): { group: Group; why: string } {
  const byRule = (a: Group, b: Group): number => {
    switch (profile.targets) {
      case "nearest":
        return lastIfNull(a.distance, b.distance);
      case "most_wounded":
        return woundedShare(a.target) - woundedShare(b.target);
      case "spellcasters_first": {
        return huntRank(a.target) - huntRank(b.target) || woundedShare(a.target) - woundedShare(b.target);
      }
      case "lowest_armor":
        return lastIfNull(armorOf(a.target, ctx), armorOf(b.target, ctx));
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
      return { group, why: group.target.concentration ? "an enemy holding a spell" : huntRank(group.target) === 0 ? "an enemy that has been seen casting" : huntRank(group.target) === 1 ? "an enemy that has been shooting" : "the most wounded enemy" };
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

const worthOf = (o: SpellOption): number => (o.spell.expectedWorth === undefined || o.spell.expectedWorth === null ? 0 : o.spell.expectedWorth);

/**
 * RULE condition-worth (app convention): only a trained or tactical creature counts what a condition is worth
 * (`expectedWorth`, built from what the fight has shown of the target); a lower tier values a cast at its damage alone.
 * The exception: a creature with nothing of positive value this turn (no attack it can make, no damage spell) counts it
 * too, so it casts its best condition spell rather than doing nothing.
 */
function countsWorth(profile: TacticalProfile, attacks: readonly TurnOption[], spells: readonly SpellOption[]): boolean {
  if (profile.tier === "trained" || profile.tier === "tactical") return true;
  return attacks.length === 0 && !spells.some((o) => rankOf(o.spell.expectedDamage) > 0);
}

/** What a cast is worth to compare: its expected damage plus, when worth counts, what its conditions take from the targets. Unknown damage stays unknown. */
function valueOf(option: SpellOption, counted: boolean): number | null {
  const damage = option.spell.expectedDamage;
  if (damage === null) return null;
  return counted ? damage + worthOf(option) : damage;
}

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
 * Every attack counts as free: whether an attack is itself limited (a recharge, N per day) is not on the option. A free
 * spell counts at its value (`valueOf`), so a clever creature does not Hold a foe at 2 hit points either.
 */
function castCandidates(spells: readonly SpellOption[], attacks: readonly TurnOption[], profile: TacticalProfile, ctx: PickContext): SpellOption[] {
  let safe = spells.filter((o) => o.spell.friendsCaught.length === 0);
  // RULE provokes (as `bestAttack`): a trained or tactical creature skips a cast that walks into an opportunity attack (a moved spell
  // option) when another cast does not.
  if (profile.tier === "trained" || profile.tier === "tactical") {
    const clean = safe.filter((o) => o.provokes.length === 0);
    if (clean.length > 0) safe = clean;
  }
  const counted = countsWorth(profile, attacks, safe);
  const free = [...attacks.map(expectedOf), ...safe.filter((o) => !o.spell.spends).map((o) => valueOf(o, counted))].reduce<number>((best, e) => Math.max(best, rankOf(e)), Number.NEGATIVE_INFINITY);
  return safe.filter((o) => !(o.spell.spends && free >= hitPointsLeft(o, ctx)));
}

/** Why a target is worth a cast, from what the fight has shown of it; null when it has shown nothing to say. */
function becauseOf(target: RunCombatant): string | null {
  const perTurn = seenDamagePerTurn(target);
  if (perTurn !== null && perTurn > 0) return `who has been dealing about ${Math.round(perTurn)} damage a turn`;
  if (seenAs(target).caster) return "who has been seen casting";
  return null;
}

/**
 * RULE cast: the best cast on the chosen target, compared with the best attack by expected damage plus (RULE condition-worth,
 * above) what its conditions are worth. A single-target spell is compared only for the target the `targets` rule chose; an
 * area spell whenever that target is among those it hits. The higher number wins; a tie goes to the option that spends
 * nothing, then to the attack (every attack counts as spending nothing, as above), so a tie or two unknowns is the attack.
 * With no attack to compare, the `targets` rule picks the target among the casts.
 *
 * RULE spell-for-its-target (app convention, the maintainer: "the spell itself usually helps pick a target"): a trained or
 * tactical creature is not limited to that target for a single-target condition spell. It weighs the spell on every target
 * in range and takes the highest value, which is what sends Hold Person to the brawler and a spell that stops casting to the
 * caster. Damage spells, and lower tiers, keep the chosen target only.
 */
function bestCast(candidates: readonly SpellOption[], chosenAttack: { option: TurnOption; target: RunCombatant } | null, attacks: readonly TurnOption[], profile: TacticalProfile, ctx: PickContext): { option: SpellOption; why: string | null; counted: boolean; retargeted: boolean } | null {
  if (candidates.length === 0) return null;
  const counted = countsWorth(profile, attacks, candidates);
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
  const clever = profile.tier === "trained" || profile.tier === "tactical";
  const onTarget = candidates.filter((o) => o.spell.targetIds.includes(target.instance_id) || (clever && o.spell.targetIds.length === 1 && worthOf(o) > 0));
  const ranked = onTarget
    .map((option, index) => ({ option, index }))
    .sort((a, b) => rankOf(valueOf(b.option, counted)) - rankOf(valueOf(a.option, counted)) || Number(a.option.spell.spends) - Number(b.option.spell.spends) || a.index - b.index);
  const best = ranked[0];
  if (best === undefined) return null;
  if (chosenAttack !== null && rankOf(valueOf(best.option, counted)) <= rankOf(expectedOf(chosenAttack.option))) return null;
  const retargeted = !best.option.spell.targetIds.includes(target.instance_id);
  return { option: best.option, why: retargeted ? null : why, counted, retargeted };
}

function describeCast(option: SpellOption, why: string | null, ctx: PickContext, against: TurnOption | null, counted: boolean): string {
  const { spell } = option;
  const nameOf = (id: string) => ctx.combatants.find((c) => c.instance_id === id)?.name ?? id;
  const names = spell.targetIds.map(nameOf);
  const who = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const level = spell.castLevel > 0 ? ` (level ${spell.castLevel})` : "";
  const worth = counted ? worthOf(option) : 0;
  const single = names.length === 1 ? ctx.combatants.find((c) => c.instance_id === spell.targetIds[0]) : undefined;
  // A cast chosen for what it does to its target says why that target, from what the fight has shown of it.
  const because = worth > 0 && single !== undefined ? becauseOf(single) : null;
  const reason = because !== null ? `, ${because}` : why !== null && names.length === 1 ? `, ${why}` : "";
  const base = `Casts ${spell.name}${level} at ${who}${reason}`;
  if (spell.expectedDamage === null) return `${base}.`;
  const hit = against === null || against.attack === null || against.attack.expectedDamage === null ? "" : `, against about ${Math.round(against.attack.expectedDamage)} from ${against.attack.action}`;
  const spent = spell.spends ? ` and spends a ${spell.castLevel > 0 ? `level ${spell.castLevel} slot` : "use"}` : "";
  if (worth > 0) {
    const what = spell.imposes === undefined || spell.imposes.length === 0 ? "what it imposes" : spell.imposes.join(" and ");
    const damage = spell.expectedDamage > 0 ? `about ${Math.round(spell.expectedDamage)} damage, and ` : "";
    return `${base}: ${damage}${what} takes away about ${Math.round(worth)} damage of what it deals${hit}${spent}.`;
  }
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
 * The shared steps of running: RULE break-free-first (below), a held creature cannot run, so one that can try to break free
 * does that first; then Flee, else Disengage, else Dodge. Null when none of those is on offer. `cause` finishes the reason.
 */
function runAway(options: readonly TurnOption[], mover: RunCombatant, cause: string): TurnPick | null {
  const find = (kind: string) => options.find((o) => o.kind === kind);
  const freeing = isHeld(mover) ? find("break_free") : undefined;
  if (freeing !== undefined) return { optionId: freeing.id, reason: `Struggles free: ${cause} but is held, so it tries to break free before it runs.` };
  const retreat = find("flee") ?? find("disengage") ?? find("dodge");
  if (retreat === undefined) return null;
  const { exitKind, exitLabel } = retreat;
  const leaving = retreat.leavesMap === true && exitKind !== undefined && exitKind !== null
    ? `, leaving the map ${wayOffPhrase(exitKind, exitLabel === undefined ? null : exitLabel, true)}`
    : "";
  return { optionId: retreat.id, reason: `Falls back: ${cause} and ${RETREAT_VERB[retreat.kind]}${leaving}.` };
}

/**
 * The creature's choice from the (gated) options, deterministic, with a plain reason. Null only for an empty list.
 * Order: a broken creature escapes if it can, else retreats (or yields); a lone option is taken; otherwise it attacks the target its `targets`
 * rule picks with that target's best option; with no attack on offer it closes on a target, else it Dodges, else
 * takes the first option.
 */
export function pickTurn(offered: readonly TurnOption[], profile: TacticalProfile, ctx: PickContext): TurnPick | null {
  // A Bonus Action heal or boon is no turn of its own: it rides the turn chosen here (`healChoice.ts`, `boonChoice.ts`).
  const options = offered.filter((o) => !(isHealOption(o) && o.heal.slot === "bonus_action") && !(isBoonOption(o) && o.boon.slot === "bonus_action"));
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
      const ran = runAway(options, mover, standing);
      if (ran !== null) return ran;
    }
  }

  // RULE flee-by-spell: a creature made to flee a caster runs, by the same steps as a broken one (held: break free first).
  const feared = mover === undefined ? null : fleeSourceOf(mover, ctx.combatants);
  if (mover !== undefined && feared !== null) {
    const ran = runAway(options, mover, `it must get away from ${feared.name}`);
    if (ran !== null) return ran;
  }

  // RULE break-free-first (app convention; the books do not say how a monster spends its Action when held). A held creature
  // (Restrained or Grappled) that can try to break free of the hold, and has nothing it can attack or cast at from where it
  // stands, tries to break free: standing still helps no one. One that can still attack does, because an attack is what its
  // Action is for, EXCEPT a trained or tactical creature held by Restrained, which breaks free first: attacks against a
  // Restrained creature have advantage and its own attacks have disadvantage, and a creature that weighs its turn sees that
  // staying held is the worse trade. A dimmer creature (instinct, simple) just keeps swinging. A creature that bears no such
  // hold has no break_free option, so this changes nothing for it.
  const freeing = mover !== undefined && isHeld(mover) ? (options.find((o) => o.kind === "break_free" && o.breakFree?.name === "Restrained") ?? find("break_free")) : undefined;
  if (mover !== undefined && freeing !== undefined) {
    const canStrike = options.some((o) => o.kind === "attack" || o.kind === "spell");
    const weighsItsTurn = profile.tier === "trained" || profile.tier === "tactical";
    const restrained = freeing.breakFree?.name === "Restrained";
    if (!canStrike || (weighsItsTurn && restrained)) {
      const why = !canStrike ? "it is held and has nothing it can attack from where it stands" : "attacks against it have advantage and its own have disadvantage while it is Restrained";
      return { optionId: freeing.id, reason: `Struggles free: ${why}, so it tries to break free of ${freeing.breakFree?.name}.` };
    }
  }

  // RULE heal-down, heal-low (`healChoice.ts`): getting an ally up, or one below half back on their feet, comes before an attack or a damage spell.
  const heal = chooseActionHeal(options, ctx.combatants);
  if (heal !== null) return { optionId: heal.option.id, reason: heal.reason };

  // RULE boon-early (`boonChoice.ts`): a boon is cast early, while the fight is ahead of it, before the attacks.
  const boon = mover === undefined ? null : chooseActionBoon(options, ctx.combatants, mover, ctx.round);
  if (boon !== null) return { optionId: boon.option.id, reason: boon.reason };

  const attacks = options.filter((o) => o.kind === "attack");
  const attackChoice = attacks.length === 0 ? null : chooseTarget(groupByTarget(attacks, ctx, (o) => (o.attack === null ? null : o.attack.distanceFeet)), profile, ctx);
  const best = attackChoice === null ? null : { option: bestAttack(attackChoice.group.options, profile), target: attackChoice.group.target };
  const casts = options.filter(isSpellOption);
  if (casts.length > 0) {
    const cast = bestCast(castCandidates(casts, attacks, profile, ctx), best, attacks, profile, ctx);
    if (cast !== null) {
      const why = cast.why !== null ? cast.why : attackChoice === null || cast.retargeted ? null : attackChoice.why;
      const surge = cast.option.spell.surge;
      const surged = surge === undefined ? "" : ` With Action Surge it then takes a second action: ${surge.second.summary.charAt(0).toLowerCase()}${surge.second.summary.slice(1)}, so the figures count both.`;
      return { optionId: cast.option.id, reason: `${describeCast(cast.option, why, ctx, best === null ? null : best.option, cast.counted)}${surged}` };
    }
  }
  if (attackChoice !== null && best !== null) return { optionId: best.option.id, reason: describeAttack(best.option, best.target, attackChoice.why) };
  // A cast that was ruled out is no turn to fall back on: what is left is judged without it, unless nothing else is on offer.
  const left = options.filter((o) => o.kind !== "spell" && o.kind !== "heal" && o.kind !== "boon");
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
