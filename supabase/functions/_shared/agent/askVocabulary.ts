// The words a DM uses at the table for what the tome files under its own names (maintainer, 25 Nov 2026).
//
// Asked "which champions are in this game", Ask did not know the champions were the player characters and had to be
// told. Its readers take record types (`party_member`, `location`), and nothing said which everyday word means which
// type. This list does: one line per type in the standing instructions (`askPrompt.ts`). It is static, so the
// instructions stay byte-identical from turn to turn.
//
// A word belongs to one type only (held by `askVocabulary.test.ts`): a word listed under two would send the model to
// either. Words that are truly ambiguous at a table ("characters", "group") are handled in the prompt's prose instead.

export interface AskVocabularyEntry {
  /** The record type the readers take. */
  type: string;
  /** What the type holds, in a few words. */
  holds: string;
  /** What a DM may call it. */
  words: readonly string[];
}

export const ASK_VOCABULARY: readonly AskVocabularyEntry[] = [
  {
    type: "party_member",
    holds: "the characters the players play",
    words: ["player characters", "PCs", "the party", "heroes", "champions", "adventurers", "protagonists", "the players", "the crew", "the fellowship"],
  },
  {
    type: "npc",
    holds: "the people the DM plays",
    words: ["NPCs", "non-player characters", "people", "townsfolk", "villagers", "villains", "allies", "contacts", "shopkeepers", "patrons"],
  },
  { type: "monster", holds: "creatures and their stat blocks", words: ["creatures", "beasts", "enemies", "foes", "the bestiary"] },
  {
    type: "location",
    holds: "places, at every size",
    words: ["places", "towns", "cities", "villages", "regions", "countries", "dungeons", "sites", "maps", "the atlas"],
  },
  { type: "room", holds: "a part of a site", words: ["rooms", "chambers", "halls", "areas of a dungeon"] },
  { type: "faction", holds: "organised groups", words: ["guilds", "orders", "cults", "houses", "clans", "gangs", "organisations"] },
  { type: "quest", holds: "what the party is doing or could do", words: ["missions", "jobs", "adventures", "storylines", "plots", "hooks", "arcs"] },
  { type: "quest_beat", holds: "a step of a quest", words: ["scenes", "steps", "chapters", "story beats"] },
  { type: "encounter", holds: "a prepared fight", words: ["fights", "battles", "combats", "skirmishes", "ambushes"] },
  { type: "deity", holds: "gods and powers", words: ["gods", "goddesses", "the pantheon", "religions", "patron powers"] },
  { type: "item", holds: "things that can be owned", words: ["loot", "treasure", "gear", "equipment", "artifacts", "relics", "magic items"] },
  { type: "spell", holds: "spells", words: ["magic", "cantrips", "rituals"] },
  { type: "canon", holds: "what is true in the world", words: ["lore", "history", "backstory", "legends", "myths", "the setting"] },
  { type: "note", holds: "the DM's own notes", words: ["prep", "session notes", "journal", "reminders"] },
];

/** What a DM may call the campaign itself. */
export const ASK_CAMPAIGN_WORDS: readonly string[] = ["the game", "the world", "the story", "the table", "the adventure"];

/** One line per type, for the standing instructions. */
export function vocabularyLines(): string {
  return ASK_VOCABULARY.map((entry) => `- ${entry.type} (${entry.holds}): ${entry.words.join(", ")}`).join("\n");
}
