// Ask Grimoire: Generators that fill the form open on the page instead of making a record (#1270): an editor's own
// Generate (a new NPC, monster or spell) and the calendar's Draft with AI. Each is opened by its page's button and
// writes into that page's form; nothing is saved until the DM saves the form.
import type { AskGenerator } from "../askContract.ts";
import { image } from "./shared.ts";
import { NOTES_BUTTON_ONLY } from "./notes.ts";

export const EDITORS_GENERATORS: readonly AskGenerator[] = [
  {
    id: "npc_sheet", action: "Fill the sheet", noun: "NPC", ending: "fill",
    describe: "Fills the NPC editor that is open with a generated person.",
    inputs: {
      portrait: { ...image, label: "Portrait" },
      alter_ego: { type: "boolean", description: "Give them a disguise or second identity.", label: "Alter ego", hint: "A disguised name and portrait, priced as a second portrait" },
    },
    opened: { portrait: true },
    concept: { label: "What to make", placeholder: "A grizzled dwarven blacksmith who secretly belongs to a thieves' guild, jovial on the surface and deeply paranoid…", required: true, max: 1000 },
  },
  {
    id: "monster_sheet", action: "Fill the sheet", noun: "monster", ending: "fill", fiveE: true,
    describe: "Fills the monster editor that is open with a generated stat block.",
    inputs: {
      challenge_rating: { type: "string", description: "Challenge rating, e.g. \"1/2\" or \"7\".", label: "Challenge rating", placeholder: "e.g. 5, 1/2, 1/4" },
      monster_type: { type: "string", description: "Creature type, e.g. beast, undead, fiend.", label: "Type", list: "monster_type" },
      size: { type: "string", description: "Size.", enum: ["tiny", "small", "medium", "large", "huge", "gargantuan"], label: "Size" },
      image: { ...image, label: "Portrait art" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A colossal spider deity that dwells in the Underdark, commanding its cultists through webs of illusion and dreams…", required: true, max: 2000 },
  },
  {
    id: "spell_sheet", action: "Fill the sheet", noun: "spell", ending: "fill", fiveE: true,
    describe: "Fills the spell editor that is open with a generated spell.",
    inputs: {
      level: { type: "string", description: "Spell level as a digit, \"0\" for a cantrip.", enum: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"], label: "Level", optionLabels: { "0": "Cantrip", "1": "1st", "2": "2nd", "3": "3rd", "4": "4th", "5": "5th", "6": "6th", "7": "7th", "8": "8th", "9": "9th" } },
      school: { type: "string", description: "School of magic.", label: "School", list: "spell_school" },
      image: { ...image, label: "Spell-effect art" },
    },
    opened: { image: true },
    concept: { label: "What to make", placeholder: "A storm of luminous moths that swarm a target, biting and dazzling them with flashes of bioluminescence…", required: true, max: 1000 },
  },
  {
    id: "event_description", action: "Write the description", noun: "event", ending: "fill",
    describe: "Writes the description of the calendar event that is open.",
    inputs: {},
    concept: { label: "What should the event be about", placeholder: "A harvest festival for the river god…", max: 1000 },
  },
];

/**
 * Generators that only make sense beside the form they fill: a model asked for "a new NPC" must propose the generator
 * that makes one (`npc`), never `npc_sheet`, which has no form to fill when the DM is elsewhere. They open from their
 * page's button, so `generatorsFor` leaves them out of the model's list and `checkProposal` refuses them.
 */
export const BUTTON_ONLY_GENERATORS: ReadonlySet<string> = new Set([...EDITORS_GENERATORS.map((g) => g.id), ...NOTES_BUTTON_ONLY]);
