/**
 * `quests.summary` is the blurb that lets you tell what a quest is without
 * opening it — one line, enforced in the database by
 * `quests_summary_is_one_line` (migration `20260906160921_sweep_the_quest_residue.sql`):
 * `char_length(summary) <= 280 and summary !~ E'[\n\r]'`. It is shown
 * verbatim to players (the DM quest card, the kanban board, the player quest
 * log and the player quest page, and it's matched by quest search), so it is
 * also a spoiler channel, not just a length limit — see `QuestOverviewMetadata.vue`
 * and `QuestFlowStarter.vue`, the only two editors for this field.
 *
 * `QUEST_SUMMARY_MAX` is the one place the cap is a number; every input that
 * writes this column imports it rather than repeating `280`.
 */
export const QUEST_SUMMARY_MAX = 280;

/**
 * Splits free text at the end of its first sentence, for callers that receive
 * unconstrained prose (an AI extraction, an imported document) and must not
 * silently truncate it into the one-line `summary` column. A cut sentence is
 * a lie — see `src/lib/documentImport/normalize.ts`, which is the one caller:
 * `mapExtractedQuest` used to run the extracted summary through the same
 * 600-character prose cap it uses for a character backstory, which is how a
 * five-sentence adventure blurb ended up in a one-line field (#799).
 *
 * `head` becomes `summary`; `tail`, when non-empty, is appended to the
 * opening beat's `dm_content` — prose belongs on a beat, not the quest header.
 *
 * Mirrors the migration's own split (`^[^.!?]*[.!?]`), deliberately unbounded:
 * Postgres caps bounded repetition at 255, so a `{1,280}` quantifier there
 * raises `invalid repetition count(s)`; there is no such limit in a JS regex,
 * but matching the same unbounded pattern keeps the two implementations
 * describing the same rule. When no sentence terminator exists at all, the
 * whole (trimmed) text becomes `head` and `tail` is empty — a short one-liner
 * with no punctuation ("Find the lost sword") is not truncated for lacking a
 * period.
 */
export function splitQuestSummary(text: string | null | undefined): { head: string | null; tail: string } {
  if (!text) return { head: null, tail: "" };
  const trimmed = text.trim();
  if (!trimmed) return { head: null, tail: "" };
  const match = trimmed.match(/^[^.!?]*[.!?]/);
  if (!match) return { head: trimmed, tail: "" };
  return {
    head: match[0].trim(),
    tail: trimmed.slice(match[0].length).trim(),
  };
}
