import type { CraftingDiscipline } from "@/types/crafting.types";
import { getDiscipline } from "@/lib/crafting/disciplines";

/**
 * Whether a recipe modifier repeats its discipline's workspace bonus (#1081, #1091).
 *
 * The attempt dialog offers each discipline's workspace as its own checkbox and
 * lists the recipe's modifiers beside it, so a forge, lab or workshop modifier
 * is the same bonus twice. Matched on the discipline's own label and on the
 * nouns for *that discipline's* workspace, since most copies are reworded
 * ("Proper workshop available"). Another discipline's workspace is not a
 * repeat: "Ingredients dried in a drying room" is a real condition on an
 * alchemy recipe, and the AI normaliser deletes what this matches, so it must
 * not reach past the discipline's own place.
 * Only bonuses count: a penalty that names a place ("Serving a full tavern −2")
 * is a situation, not the workspace.
 *
 * Used where a modifier is written (the recipe editor's warning, the AI
 * generator's normaliser, the starter-recipe test), never to hide one in the
 * dialog: that would paper over the data rather than fix it.
 */

/** A proper place to work, whatever the craft. */
const GENERIC = ["workspace", "workshop", "workroom", "workbench"];

const WORKSPACE_NOUNS: Record<CraftingDiscipline, string[]> = {
  alchemy: ["lab", "laboratory", "apothecary"],
  smithing: ["forge", "smithy"],
  leathercraft: ["tannery"],
  woodcraft: [],
  jewelcrafting: ["bench"],
  herbalism: ["herb garden", "drying room"],
  poisoncraft: ["lab", "laboratory", "apothecary"],
  tinkering: ["bench"],
  cooking: ["kitchen"],
  scribing: ["scriptorium", "writing desk"],
  forgery: ["studio"],
  brewing: ["brewery", "brewing facility", "tavern"],
  weaving: ["loom", "tailoring room"],
  masonry: ["quarry", "stoneyard", "mason's yard"],
  painting: ["studio", "scriptorium"],
};

const PATTERNS = new Map(
  (Object.entries(WORKSPACE_NOUNS) as [CraftingDiscipline, string[]][]).map(([discipline, nouns]) => [
    discipline,
    new RegExp(`\\b(${[...GENERIC, ...nouns].join("|")})\\b`, "i"),
  ]),
);

export function repeatsWorkspaceBonus(
  discipline: CraftingDiscipline,
  modifier: { description: string; bonus: number },
): boolean {
  if (!(modifier.bonus > 0)) return false;
  const description = modifier.description.trim().toLowerCase();
  if (!description) return false;
  if (description === getDiscipline(discipline).workspaceLabel.toLowerCase()) return true;
  return PATTERNS.get(discipline)?.test(description) ?? false;
}
