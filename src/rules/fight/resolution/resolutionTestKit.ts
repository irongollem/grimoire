/**
 * The shared kit of the resolution tests: scripted dice, and a fight with the context that resolves against it.
 */
import { ALL_DICE, type DieSize } from "@/lib/dice/dice";
import type { RolledFaces } from "@/lib/dice/diceRules";
import { dnd5eDiceRules } from "@/systems/dnd5e/dice/rules";
import type { RunCombatant } from "@/types/encounter.types";
import { emptyDefenses, type Defenses, type StatBlockEntry } from "@/types/statBlock.types";
import type { DiceAsk, DiceSource, ResolutionContext } from "./context";
import { effectiveArmorClass, parseArmorClass } from "../targeting";
import { applyFightCommand } from "../fightCommands";
import { combatant, deps, fight } from "../fightTestKit";
import type { Cover } from "../terrain/sight";

/** Dice that come back as the faces the script lists, one list per roll, scored by the 5e rules like a physical roll typed in. */
export function scripted(rolls: number[][]) {
  const asks: DiceAsk[] = [];
  const dice: DiceSource = async (ask) => {
    asks.push(ask);
    const flat = rolls.shift();
    if (!flat) throw new Error(`No roll was scripted for "${ask.label}"`);
    const mode = ask.mode ?? "normal";
    const faces: RolledFaces = {};
    let offset = 0;
    for (const sides of ALL_DICE) {
      const need = dnd5eDiceRules.facesNeeded(sides, ask.counts[sides] ?? 0, mode);
      if (need > 0) faces[sides as DieSize] = flat.slice(offset, offset + need);
      offset += need;
    }
    if (offset !== flat.length) throw new Error(`"${ask.label}" took ${offset} faces, the script gave ${flat.length}`);
    return { result: dnd5eDiceRules.score(ask.counts, ask.modifier, mode, faces), byPerson: false };
  };
  return { dice, asks };
}

export interface Setup {
  dice: DiceSource;
  /** Save bonus by instance id; a combatant not listed has none (a player rolls their own). */
  bonus?: Record<string, number>;
  defenses?: Record<string, Defenses>;
  ruleset?: "2014" | "2024";
  /** The cover each target (by instance id) has against whoever acts; supplying this installs the context's `coverFor` hook, like the server does. A target not listed is unknown (null). */
  cover?: Record<string, Cover>;
  /** "unknown" leaves out the context's `factionOf`, as a context that cannot tell sides does. */
  sides?: "unknown";
}

/** A fight, and the context that resolves against it. `state()` is the fight as the resolution left it. */
export function table(combatants: RunCombatant[], setup: Setup) {
  const ruleset = setup.ruleset ?? "2014";
  let current = fight(combatants, [], { ruleset });
  const ctx: ResolutionContext = {
    ruleset,
    dice: setup.dice,
    armorClassFor: (c) => parseArmorClass(effectiveArmorClass(c)),
    defensesFor: (c) => setup.defenses?.[c.instance_id] ?? emptyDefenses(),
    saveBonusFor: (c) => setup.bonus?.[c.instance_id] ?? null,
    live: (c) => current.combatants.find((x) => x.instance_id === c.instance_id) ?? c,
    factionOf: setup.sides === "unknown" ? undefined : (id) => current.combatants.find((x) => x.instance_id === id)?.faction_id ?? null,
    coverFor: setup.cover
      ? (_attacker, target) => {
          const found = setup.cover?.[target.instance_id];
          return found === undefined ? null : found;
        }
      : undefined,
    apply(command) {
      const result = applyFightCommand(current, command, deps());
      current = result.state;
      return result.effects;
    },
  };
  const get = (id: string): RunCombatant => {
    const found = current.combatants.find((c) => c.instance_id === id);
    if (!found) throw new Error(`no ${id}`);
    return found;
  };
  return { ctx, get, hp: (id: string) => get(id).hp };
}

export const bite = (dice: string, bonus = 4): StatBlockEntry => ({
  name: "Bite",
  description: "",
  structured: { kind: "attack", source: "manual", attack: { delivery: "melee", bonus, hit: [{ dice, type: "piercing" }] } },
});

export const wolf = () => combatant("wolf", { hp: 11, max_hp: 11 });
export const victim = (over: Partial<RunCombatant> = {}) => combatant("victim", { hp: 40, max_hp: 40, ac: "13", ...over });

