import type { CraftingDiscipline } from "@/types/crafting.types";
import { getDiscipline } from "@/lib/crafting/disciplines";

/**
 * Whether a recipe modifier repeats its discipline's workspace bonus (#1081, #1091).
 *
 * The attempt dialog offers each discipline's workspace as its own checkbox and
 * lists the recipe's modifiers beside it, so a forge, lab or workshop modifier
 * is the same bonus twice. Matched on the discipline's own label and on
 * workspace nouns, since most copies are reworded ("Proper workshop available").
 * Only bonuses count: a penalty that names a place ("Serving a full tavern −2")
 * is a situation, not the workspace.
 *
 * Used where a modifier is written (the recipe editor's warning, the AI
 * generator's normaliser, the starter-recipe test), never to hide one in the
 * dialog: that would paper over the data rather than fix it.
 */
const WORKSPACE_WORDS =
  /\b(forge|smithy|workshop|lab|laboratory|apothecary|bench|studio|scriptorium|stoneyard|mason's yard|quarry|loom|tailoring room|kitchen|herb garden|drying room|workroom|brewery|brewing facility|tavern|writing desk)\b/i;

export function repeatsWorkspaceBonus(
  discipline: CraftingDiscipline,
  modifier: { description: string; bonus: number },
): boolean {
  if (!(modifier.bonus > 0)) return false;
  const description = modifier.description.trim().toLowerCase();
  if (!description) return false;
  return description === getDiscipline(discipline).workspaceLabel.toLowerCase() || WORKSPACE_WORDS.test(description);
}
