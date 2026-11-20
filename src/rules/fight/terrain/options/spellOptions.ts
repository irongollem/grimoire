// Rule 11 and 12: the options that spend the Action on something other than an attack, a spell cast from where the
// creature stands (or, when it has none there, from a square it walks to) and a check to break free of a hold.

import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { isAllyOf } from "../../allies.ts";
import { isHostileTo } from "../../sides.ts";
import { aimableHostiles } from "../../hiding.ts";
import type { FightMap } from "../battleMap.ts";
import { boonTargetings, type BoonTargeting } from "../boonTargeting.ts";
import { healTargetings, type HealTargeting } from "../healTargeting.ts";
import { spellTargetings, type SpellTargeting } from "../spellTargeting.ts";
import { castVerb, andList, exposurePhrase, provokesPhrase } from "./phrases.ts";
import { castKey, movedSpellTargetings, type MovedTargeting } from "./movedSpells.ts";
import { emptyMovement, exposureAt, isLiving, isOnBoard, type Scene } from "./scene.ts";
import { MAX_HEAL_OPTIONS, MAX_SPELL_OPTIONS, type TurnOption, type TurnOptionsInput } from "./types.ts";

export type SpellTargetingScene = { map: FightMap };

/**
 * Rule 11: a cast as an option. It carries no movement when it is cast from where the creature stands; a cast from a square it
 * walks to (`movedSpells.ts`) carries the walk as an approach attack does: destination, path, feet, provokes and exposure.
 */
function spellOption(mover: RunCombatant, names: ReadonlyMap<string, string>, t: SpellTargeting, walk?: { moved: MovedTargeting; scene: Scene }): TurnOption {
  const { cast } = t;
  const nameOf = (id: string) => names.get(id) ?? id;
  const level = cast.castLevel > 0 ? ` (level ${cast.castLevel})` : "";
  const who = andList(t.targetIds.map(nameOf));
  const where = t.centerId === null ? `from ${walk === undefined ? `where ${mover.name} stands` : "there"}, catching ${who}` : t.targetIds.length > 1 ? `at ${nameOf(t.centerId)}, catching ${who}` : `at ${who}`;
  const friends = t.friendsCaught.length === 0 ? "" : `; also catches ${andList(t.friendsCaught.map(nameOf))}`;
  const exposure = walk === undefined ? [] : exposureAt(walk.scene, walk.moved.rc.cell);
  return {
    // A moved cast has its own id: a cast from here that would catch a friend can sit in the list beside it, at the same centre.
    id: `spell:${cast.spell}:${cast.castLevel}:${t.centerId === null ? "self" : t.centerId}${walk === undefined ? "" : ":walk"}`,
    kind: "spell",
    targetId: t.centerId,
    ...emptyMovement(),
    ...(walk === undefined ? {} : { destination: walk.moved.rc.cell, path: walk.moved.rc.path, feet: walk.moved.rc.feet, provokes: walk.moved.provokes, exposure }),
    attack: null,
    spell: { name: cast.spell, castLevel: cast.castLevel, kind: cast.kind, targetIds: t.targetIds, friendsCaught: t.friendsCaught, spends: cast.useKey !== null, distanceFeet: t.distanceFeet, hitChance: null, expectedDamage: null },
    summary: `${castVerb(walk === undefined ? null : walk.moved.rc.feet)} ${cast.spell}${level} ${where}${friends}${walk === undefined ? "" : `${exposurePhrase(names, exposure)}${provokesPhrase(names, walk.moved.provokes)}`}`,
  };
}

/** Rule 11: the spell options, best first, cut to `MAX_SPELL_OPTIONS`. Only a creature with its Action free casts. */
export function spellOptionsOf(input: TurnOptionsInput, mover: RunCombatant, names: ReadonlyMap<string, string>, scene: SpellTargetingScene | null, walk?: Scene): TurnOption[] {
  if (input.spells === undefined || input.spells.length === 0 || mover.action_used === true) return [];
  const living = input.combatants.filter((c) => c.instance_id !== mover.instance_id && isLiving(c) && (scene === null || isOnBoard(c)));
  const base = {
    mover,
    // A hostile that holds Hidden is not aimed at (`aimableHostiles`): a single target, a multi-target cast and the centre of an area all pick from these.
    hostiles: aimableHostiles(living.filter((c) => isHostileTo(mover, c, input.factions ?? []))),
    // An ally fights on the mover's side; a Neutral is neither foe nor ally, so no heal or buff is aimed at it (`isAllyOf`).
    allies: living.filter((c) => isAllyOf(mover, c, input.factions ?? [])),
    scene: scene === null ? null : { occluders: scene.map.occluders, onBoard: input.combatants.filter(isOnBoard) },
    spells: input.spells,
    kindOf: input.kindOf,
  };
  const targetings = spellTargetings(base);
  const nearest = (t: SpellTargeting) => (t.distanceFeet === null ? 0 : t.distanceFeet);
  const here = targetings
    .map((t, order) => ({ t, order }))
    .sort((a, b) => a.t.friendsCaught.length - b.t.friendsCaught.length || b.t.targetIds.length - a.t.targetIds.length || nearest(a.t) - nearest(b.t) || a.order - b.order)
    .slice(0, MAX_SPELL_OPTIONS)
    .map(({ t }) => spellOption(mover, names, t));
  if (walk === undefined) return here;
  // Rule 11, moving for a better cast: only a spell with no safe option from here is looked for from a square the creature walks to.
  const usable = new Set(targetings.filter((t) => t.friendsCaught.length === 0).map((t) => castKey(t.cast)));
  const moved = movedSpellTargetings(walk, base, input.spells.filter((cast) => !usable.has(castKey(cast))));
  const walks = [...moved.values()].map((m) => spellOption(mover, names, m.targeting, { moved: m, scene: walk }));
  return [...here, ...walks].slice(0, MAX_SPELL_OPTIONS);
}

/**
 * Rule 12, break free (#1021): a creature held by a spell that lets it end the hold with an ability check (Black Tentacles,
 * Entangle, Web) is offered that check, one option per such condition, while its Action is free. The check costs the Action
 * (the only form the spells use). It carries no movement.
 */
export function breakFreeOptions(input: TurnOptionsInput, mover: RunCombatant): TurnOption[] {
  if (mover.action_used === true) return [];
  return mover.conditions.flatMap((c): TurnOption[] => {
    const way = c.breakFree;
    if (way === undefined || way.abilities.length === 0) return [];
    const ability = input.breakFreeAbility === undefined ? way.abilities[0] : input.breakFreeAbility(way);
    return [{
      id: `break_free:${c.name}`,
      kind: "break_free",
      targetId: null,
      ...emptyMovement(),
      attack: null,
      breakFree: { name: c.name, ability },
      summary: `Break free of ${c.name}: a ${ability.toUpperCase()} check against DC ${way.dc}, using its Action`,
    }];
  });
}

/** Rule 13: a heal as an option. It carries no movement: it is cast from where the creature stands. */
function healOption(mover: RunCombatant, names: ReadonlyMap<string, string>, t: HealTargeting): TurnOption {
  const { heal } = t;
  const nameOf = (id: string) => (id === mover.instance_id ? "itself" : (names.get(id) ?? id));
  const level = heal.castLevel > 0 ? ` (level ${heal.castLevel})` : "";
  const bonus = heal.plan.slot === "bonus_action" ? " as a Bonus Action" : "";
  return {
    id: `heal:${heal.spell}:${heal.castLevel}:${t.targetIds.length === 1 ? t.targetIds[0] : "group"}`,
    kind: "heal",
    targetId: t.targetIds[0],
    ...emptyMovement(),
    attack: null,
    heal: {
      name: heal.spell, castLevel: heal.castLevel, slot: heal.plan.slot, targetIds: t.targetIds, downIds: t.downIds, lowIds: t.lowIds,
      spends: heal.useKey !== null, expectedEach: heal.plan.average, pool: heal.plan.pool, ...(heal.plan.full ? { full: true } : {}), distanceFeet: t.distanceFeet,
    },
    summary: `Cast ${heal.spell}${level}${bonus} to heal ${andList(t.targetIds.map(nameOf))}`,
  };
}

/**
 * Rule 13: the heal options, the neediest first, cut to `MAX_HEAL_OPTIONS`. A creature heals people on its own side (itself
 * included) who are hurt or down: see `healTargeting.ts`. An Action heal needs the Action free and a Bonus Action heal the Bonus
 * Action free; the Action one is a turn of its own, the Bonus Action one rides another turn (`tactics/bonusHeal.ts`).
 */
export function healOptionsOf(input: TurnOptionsInput, mover: RunCombatant, names: ReadonlyMap<string, string>, scene: SpellTargetingScene | null): TurnOption[] {
  if (input.heals === undefined || input.heals.length === 0) return [];
  const heals = input.heals.filter((h) => (h.plan.slot === "action" ? mover.action_used !== true : mover.bonus_used !== true));
  if (heals.length === 0) return [];
  const side = input.combatants.filter((c) => c.instance_id !== mover.instance_id && isAllyOf(mover, c, input.factions ?? []) && (scene === null || isOnBoard(c)));
  const targetings = healTargetings({
    mover,
    allies: side,
    scene: scene === null ? null : { occluders: scene.map.occluders, onBoard: input.combatants.filter(isOnBoard) },
    heals,
    kindOf: input.kindOf,
  });
  const urgency = (t: HealTargeting) => (t.downIds.length > 0 ? 0 : t.lowIds.length > 0 ? 1 : 2);
  return targetings
    .map((t, order) => ({ t, order }))
    .sort((a, b) => urgency(a.t) - urgency(b.t) || b.t.targetIds.length - a.t.targetIds.length || a.order - b.order)
    .slice(0, MAX_HEAL_OPTIONS)
    .map(({ t }) => healOption(mover, names, t));
}

/** Rule 14: a boon as an option. It carries no movement: it is cast from where the creature stands. */
function boonOption(mover: RunCombatant, names: ReadonlyMap<string, string>, t: BoonTargeting): TurnOption {
  const { boon } = t;
  const nameOf = (id: string) => (id === mover.instance_id ? "itself" : (names.get(id) ?? id));
  const level = boon.castLevel > 0 ? ` (level ${boon.castLevel})` : "";
  const bonus = boon.plan.slot === "bonus_action" ? " as a Bonus Action" : "";
  return {
    id: `boon:${boon.spell}:${boon.castLevel}`,
    kind: "boon",
    targetId: t.targetIds[0],
    ...emptyMovement(),
    attack: null,
    boon: {
      name: boon.spell, castLevel: boon.castLevel, slot: boon.plan.slot, targetIds: t.targetIds, spends: boon.useKey !== null,
      distanceFeet: t.distanceFeet, targetCount: boon.plan.targetCount, concentration: boon.plan.concentration,
    },
    summary: `Cast ${boon.spell}${level}${bonus} on ${andList(t.targetIds.map(nameOf))}`,
  };
}

/**
 * Rule 14: the boon options, one per spell and level, at the creatures of the caster's own side it reaches (itself included): see
 * `boonTargeting.ts` for who and in what order. An Action boon needs the Action free and a Bonus Action boon the Bonus Action free;
 * the Action one is a turn of its own, the Bonus Action one rides another turn (`tactics/boonChoice.ts`). Whether to cast one now is tactics, not this file.
 */
export function boonOptionsOf(input: TurnOptionsInput, mover: RunCombatant, names: ReadonlyMap<string, string>, scene: SpellTargetingScene | null): TurnOption[] {
  if (input.boons === undefined || input.boons.length === 0) return [];
  const boons = input.boons.filter((b) => (b.plan.slot === "action" ? mover.action_used !== true : mover.bonus_used !== true));
  if (boons.length === 0) return [];
  const living = input.combatants.filter((c) => c.instance_id !== mover.instance_id && isLiving(c) && (scene === null || isOnBoard(c)));
  return boonTargetings({
    mover,
    allies: living.filter((c) => isAllyOf(mover, c, input.factions ?? [])),
    hostiles: living.filter((c) => isHostileTo(mover, c, input.factions ?? [])),
    scene: scene === null ? null : { occluders: scene.map.occluders, onBoard: input.combatants.filter(isOnBoard) },
    boons,
  }).map((t) => boonOption(mover, names, t));
}
