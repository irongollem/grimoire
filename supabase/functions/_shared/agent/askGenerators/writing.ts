// Ask Grimoire: Writing and sound: Scriptorium drafts, connections, music.
// One module per group so the generators of one group can change without touching another's (#1270).
import type { AskGenerator } from "../askContract.ts";

export const WRITING_GENERATORS: readonly AskGenerator[] = [
  {
    id: "scriptorium_draft", action: "Draft document", noun: "document", ending: "record",
    describe: "A document drafted in the Scriptorium about one record of this campaign: a player handout, a faction dossier, or a session recap. Name the record with the id that matches what it is about: `npc_id`, `location_id` or `faction_id` for a handout (with `subject_type` saying which), `faction_id` for a dossier, `session_id` (the Chronicle entry of that session) for a recap.",
    // What `draft-scriptorium-document` takes: it refuses a draft that is not about a record of the campaign. The card
    // picks the record by kind, so the one `subject_id` the function takes is four ids here, the one that fits is read.
    inputs: {
      kind: {
        type: "string", description: "What to draft.", enum: ["handout", "faction_dossier", "session_recap"], label: "Kind",
        optionLabels: { handout: "Player handout", faction_dossier: "Faction dossier", session_recap: "Session recap" },
      },
      subject_type: {
        type: "string", description: "What a handout is about. A dossier is about a faction and a recap about a session, so leave it out for those.", enum: ["npc", "location", "faction"], label: "About",
        optionLabels: { npc: "An NPC", location: "A location", faction: "A faction" },
        when: { key: "kind", is: ["handout"] },
      },
      npc_id: { type: "string", description: "Id of the NPC a handout is about.", label: "NPC", record: "npc", when: { key: "subject_type", is: ["npc"] } },
      location_id: { type: "string", description: "Id of the place a handout is about.", label: "Location", record: "location", when: { key: "subject_type", is: ["location"] } },
      // A dossier is always about a faction; a handout only when it says so.
      faction_id: { type: "string", description: "Id of the faction a handout or a dossier is about.", label: "Faction", record: "faction", when: { key: ["subject_type", "kind"], is: ["faction", "faction_dossier"] } },
      session_id: { type: "string", description: "Id of the Chronicle entry (a note linked to a session) a recap is about.", label: "Session", record: "note", when: { key: "kind", is: ["session_recap"] } },
      audience: {
        type: "string", description: "Who reads it. A dossier is for the DM, the rest for the players, unless said.", enum: ["players", "dm"], label: "Written for",
        optionLabels: { players: "Players", dm: "DM only" },
        hint: "Players: only what they can already see is used. DM only: secrets included.",
      },
    },
    opened: { kind: "handout", subject_type: "npc", audience: "players" },
    concept: { label: "Steer (optional)", placeholder: "A hurried letter, half burnt. Make it sound afraid.", max: 1000 },
    ask: ["kind"],
  },
  {
    id: "music_track", action: "Compose music", noun: "track", ending: "record", describe: "A music track for the soundboard.",
    // `generate-music` makes 60, 120 or 180 seconds only, so the length is a word from those three, not a free number.
    inputs: {
      name: { type: "string", description: "The track's name on the board, when the DM gave one.", label: "Name", placeholder: "From the description" },
      category: {
        type: "string", description: "The board section it goes under.", enum: ["ambient", "music", "effects"], label: "Category",
      },
      length_seconds: {
        type: "string", description: "Length in seconds: \"60\", \"120\" or \"180\".", enum: ["60", "120", "180"], label: "Length",
        optionLabels: { "60": "1 min", "120": "2 min", "180": "3 min" },
      },
      vocals: {
        type: "string", description: "Instrumental (no voices), choir (a wordless choir) or vocals (a singer with lyrics).", enum: ["instrumental", "choir", "vocals"], label: "Vocals",
      },
      lyrics: {
        type: "string", description: "Lyrics for the singer, with [Verse] and [Chorus] markers. Only with vocals.", label: "Lyrics", placeholder: "[Verse 1]\nIn the depths of shadow and stone…", multiline: true,
        when: { key: "vocals", is: ["vocals"] },
      },
    },
    opened: { category: "ambient", length_seconds: "60", vocals: "instrumental" },
    concept: { label: "Description", placeholder: "e.g. the passage-grove at night, @Vesper waiting, soft and serene", required: true, max: 4000, mentions: "entities" },
  },
  // `suggest-connections` reads every kind a tie can join (the world-link catalogue's), so the card can open on any of them.
  {
    id: "connection_suggestions", action: "Suggest connections", noun: "record", ending: "review",
    describe: "Suggested ties for a record of this campaign (a person, a faction, a place, a deity, an item or a canon entry): who or what it could be connected to.",
    inputs: {},
    concept: { label: "Steer the suggestions (optional)", placeholder: "e.g. someone with a grudge against the guild", max: 500 },
    target: ["npc", "party_member", "faction", "location", "deity", "item", "canon"],
  },
];
