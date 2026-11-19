// Rule 11 and 12: the options that spend the Action on something other than an attack, a spell cast from where the
// creature stands and a check to break free of a hold.

import type { RunCombatant } from "../../../../types/encounter.types.ts";
import { isAllyOf } from "../../allies.ts";
import { isHostileTo } from "../../sides.ts";
import type { FightMap } from "../battleMap.ts";
import { spellTargetings, type SpellTargeting } from "../spellTargeting.ts";
import { andList } from "./phrases.ts";
import { emptyMovement, isLiving, isOnBoard } from "./scene.ts";
import { MAX_SPELL_OPTIONS, type TurnOption, type TurnOptionsInput } from "./types.ts";

export type SpellTargetingScene = { map: FightMap };

/** Rule 11: a cast as an option. It carries no movement: it is cast from where the creature stands. */
function spellOption(mover: RunCombatant, names: ReadonlyMap<string, string>, t: SpellTargeting): TurnOption {
  const { cast } = t;
  const nameOf = (id: string) => names.get(id) ?? id;
  const level = cast.castLevel > 0 ? ` (level ${cast.castLevel})` : "";
  const who = andList(t.targetIds.map(nameOf));
  const where = t.centerId === null ? `from where ${mover.name} stands, catching ${who}` : t.targetIds.length > 1 ? `at ${nameOf(t.centerId)}, catching ${who}` : `at ${who}`;
  const friends = t.friendsCaught.length === 0 ? "" : `; also catches ${andList(t.friendsCaught.map(nameOf))}`;
  return {
    id: `spell:${cast.spell}:${cast.castLevel}:${t.centerId === null ? "self" : t.centerId}`,
    kind: "spell",
    targetId: t.centerId,
    ...emptyMovement(),
    attack: null,
    spell: { name: cast.spell, castLevel: cast.castLevel, kind: cast.kind, targetIds: t.targetIds, friendsCaught: t.friendsCaught, spends: cast.useKey !== null, distanceFeet: t.distanceFeet, hitChance: null, expectedDamage: null },
    summary: `Cast ${cast.spell}${level} ${where}${friends}`,
  };
}

/** Rule 11: the spell options, best first, cut to `MAX_SPELL_OPTIONS`. Only a creature with its Action free casts. */
export function spellOptionsOf(input: TurnOptionsInput, mover: RunCombatant, names: ReadonlyMap<string, string>, scene: SpellTargetingScene | null): TurnOption[] {
  if (input.spells === undefined || input.spells.length === 0 || mover.action_used === true) return [];
  const living = input.combatants.filter((c) => c.instance_id !== mover.instance_id && isLiving(c) && (scene === null || isOnBoard(c)));
  const targetings = spellTargetings({
    mover,
    hostiles: living.filter((c) => isHostileTo(mover, c, input.factions ?? [])),
    // An ally fights on the mover's side; a Neutral is neither foe nor ally, so no heal or buff is aimed at it (`isAllyOf`).
    allies: living.filter((c) => isAllyOf(mover, c, input.factions ?? [])),
    scene: scene === null ? null : { occluders: scene.map.occluders, onBoard: input.combatants.filter(isOnBoard) },
    spells: input.spells,
    kindOf: input.kindOf,
  });
  const nearest = (t: SpellTargeting) => (t.distanceFeet === null ? 0 : t.distanceFeet);
  return targetings
    .map((t, order) => ({ t, order }))
    .sort((a, b) => a.t.friendsCaught.length - b.t.friendsCaught.length || b.t.targetIds.length - a.t.targetIds.length || nearest(a.t) - nearest(b.t) || a.order - b.order)
    .slice(0, MAX_SPELL_OPTIONS)
    .map(({ t }) => spellOption(mover, names, t));
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
