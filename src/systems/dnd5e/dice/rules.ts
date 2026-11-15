import type { DiceRules } from "../../../lib/dice/diceRules.ts";
import { facesNeeded, modeTakesEffect, scoreRoll } from "./d20Roll.ts";
import { advantageAppliesTo, combineModes, withModeTag } from "./rollMode.ts";

/** D&D 5e's dice rules, as the neutral dice surfaces see them through `@/systems/registry`. */
export const dnd5eDiceRules: DiceRules = {
  options: [
    { key: "disadvantage", label: "Disadvantage", short: "Dis", hint: "keep lower", tone: "danger" },
    { key: "advantage", label: "Advantage", short: "Adv", hint: "keep higher", tone: "success" },
  ],
  optionAppliesTo: advantageAppliesTo,
  facesNeeded,
  score: scoreRoll,
  combine: combineModes,
  tagLabel: (label, mode, counts) => withModeTag(label, modeTakesEffect(counts) ? mode : "normal"),
};
