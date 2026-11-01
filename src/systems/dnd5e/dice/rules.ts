import type { DiceRules } from "@/lib/dice/diceRules";
import { facesNeeded, scoreRoll } from "./d20Roll";
import { advantageAppliesTo, combineModes, withModeTag } from "./rollMode";

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
  tagLabel: withModeTag,
};
