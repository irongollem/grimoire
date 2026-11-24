/**
 * What the Narrator wrote (#1021 row 1). The AI table runs on the owner's account, so every row it writes is the
 * owner's in the database, and a session note shared with the players would otherwise read as the DM's own work
 * drafted with AI help. The maintainer, 24 Nov 2026: the AI Dungeon Master is called the Narrator, and the owner
 * staying DM while playing is fine ("its like reading a book. if you read the end youre spoiling yourself"), so the
 * only thing the seat still needed was to say who wrote what the table wrote.
 *
 * These are the `ai_provenance.generatorType`s the narrator's own writes carry (`supabase/functions/agent-turn`,
 * `agent-leave`). A character's memory (`agent_turn_memory`) is not among them: it is written in that character's
 * own words by its own call, never by the Narrator.
 */
const NARRATOR_GENERATORS: ReadonlySet<string> = new Set([
  "agent_table_record", // the session note a sitting leaves, and the story told on it
  "agent_turn_fact", // a fact put on record
  "agent_turn_character", // a person the Narrator made up
  "agent_table_hazard", // a hazard the Narrator set
]);

export function writtenByNarrator(generatorType: string | undefined): boolean {
  return generatorType !== undefined && NARRATOR_GENERATORS.has(generatorType);
}
