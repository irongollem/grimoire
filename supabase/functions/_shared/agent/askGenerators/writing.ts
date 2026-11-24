// Ask Grimoire: Writing and sound: Scriptorium drafts, connections, music.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";

export const WRITING_GENERATORS: readonly AskGenerator[] = [
  {
    id: "scriptorium_draft", action: "Draft document", noun: "document", ending: "record",
    describe: "A document drafted in the Scriptorium about one record of this campaign: a player handout, a faction dossier, or a session recap.",
    // What `draft-scriptorium-document` takes: it refuses a draft that is not about a record of the campaign.
    inputs: {
      kind: { type: "string", description: "What to draft.", enum: ["handout", "faction_dossier", "session_recap"] },
      subject_type: { type: "string", description: "What it is about. A dossier is about a faction; a recap about a session.", enum: ["npc", "location", "faction", "session"] },
      subject_id: { type: "string", description: "Id of that record in this campaign." },
      audience: { type: "string", description: "Who reads it.", enum: ["players", "dm"] },
    },
    ask: ["kind"],
  },
  // `generate-music` makes 60, 120 or 180 seconds; the browser rounds to the nearest.,
  { id: "music_track", action: "Compose music", noun: "track", ending: "record", describe: "A music track for the soundboard.", inputs: { length_seconds: { type: "integer", description: "Length in seconds: 60, 120 or 180.", minimum: 60, maximum: 180 }, vocals: { type: "boolean", description: "With singing." } } },
  { id: "connection_suggestions", action: "Suggest connections", noun: "NPC", ending: "review", describe: "Suggested relationships for an NPC.", inputs: {}, target: ["npc"] },
];
