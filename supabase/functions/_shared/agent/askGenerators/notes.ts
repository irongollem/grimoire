// Ask Grimoire: Generators that write into a note, a book's picture or an NPC's voice (#1270 story 7).
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";

export const NOTES_GENERATORS: readonly AskGenerator[] = [
  {
    id: "chronicle", action: "Write chronicle", noun: "note", ending: "fill",
    createAction: "Insert into note",
    describe: "A session chronicle written from the DM's raw facts of what happened, as a draft the DM reads before it goes into a note. It fills a note that is open, so name that note as the target.",
    inputs: {
      tone: {
        type: "string", description: "How the chronicle reads. Dramatic unless the DM said otherwise.", label: "Tone",
        enum: ["dramatic", "humorous", "mysterious", "epic"],
      },
    },
    opened: { tone: "dramatic" },
    // The Write Chronicle dialog took a longer fact-dump than the other prompts: a full session's raw notes run long.
    concept: { label: "What happened", placeholder: "Dump your notes here… use @Name to reference characters. E.g: Kira stabbed the duke, @Veyra convinced the guards it was self-defence, party escaped via sewer.", required: true, max: 3000, mentions: "entities" },
    target: ["note"],
  },
  {
    id: "scene_illustration", action: "Paint scene", noun: "note", ending: "fill",
    describe: "A scene illustration for a note that is open: a picture of what the DM describes, painted into the note. Name that note as the target.",
    inputs: {
      shape: {
        type: "string", description: "The picture's shape. Square unless the DM said landscape.", label: "Shape",
        enum: ["square", "landscape"],
      },
    },
    opened: { shape: "square" },
    concept: { label: "The scene", placeholder: "Describe the scene… use @Name to reference characters, e.g. @Aria and @Thorin face the @Dragon in the ruins.", required: true, max: 500, mentions: "entities" },
    target: ["note"],
  },
  // A picture selected in a Scriptorium book has no record to name, so the model is never offered this one
  // (`NOTES_BUTTON_ONLY`): the panel's "Describe it" opens its card, and knows which picture it is.
  {
    id: "picture_description", action: "Paint picture", noun: "picture", ending: "fill",
    describe: "A picture painted into a book's page from a description.",
    inputs: {
      shape: {
        type: "string", description: "The picture's shape.", label: "Shape",
        enum: ["page", "tall", "square", "landscape", "banner", "column"],
        optionLabels: { page: "Full page", tall: "Tall", square: "Square", landscape: "Landscape", banner: "Wide banner", column: "Narrow column" },
      },
    },
    opened: { shape: "square" },
    concept: { label: "The scene", placeholder: "Describe the scene… use @Name to reference characters, e.g. @Aria and @Thorin face the @Dragon in the ruins.", required: true, max: 500, mentions: "entities" },
  },
  {
    id: "npc_voice", action: "Suggest lines", noun: "NPC", ending: "fill",
    createAction: "Done",
    describe: "Three in-character lines an existing NPC could say in a situation at the table, to read aloud. Choose it for \"what would X say\", \"how would X answer\", \"what does X say if the guard stops him\" and \"give me a line for X\": the NPC is the target (find them with your readers first) and the situation is the concept.",
    inputs: {},
    concept: { label: "The situation", placeholder: "A player asks the guard captain why the gate is closed early…", required: true, max: 500 },
    target: ["npc"],
  },
];

/** The notes generators only a page's button opens: the model is never offered them (`BUTTON_ONLY_GENERATORS`). */
export const NOTES_BUTTON_ONLY: readonly string[] = ["picture_description"];
