/**
 * Columns `quests` used to have, stripped from any row an older export carries.
 *
 * Two migrations retired quest-level fields in favour of the beat that actually
 * owns them: #793 moved `description`/`notes` onto the opening beat, and #799
 * moved the reward columns onto the beat that grants them and dropped
 * `flow_enabled_at` with the two-generation flag it belonged to. The columns are
 * gone from the live table, so spreading an old row straight into an insert
 * sends PostgREST a `column does not exist` and fails the whole batch.
 *
 * This lives in one module because the two import paths had already drifted.
 * `useCampaignBackup` was updated for both migrations; `useWorldBundle` was
 * written for #793 and never picked up #799, so a `.grimoire` bundle containing
 * quests failed outright on import — and neither path can be type-checked into
 * agreement, because both read their rows as `Record<string, unknown>`, which
 * is exactly what let a stale key survive. A list one migration updates is a
 * list the other one has to remember; a shared list is one place to change.
 *
 * World bundles carry no version field, so there is no way to tell an old
 * export from a new one — every bundle has to be treated as possibly old. That
 * is also why this strips silently rather than throwing: the keys are not an
 * error in the file, they are the file being older than the schema.
 */
const RETIRED_QUEST_COLUMNS = [
  // #793 — the quest's prose became the opening beat's.
  "description",
  "notes",
  // #799 — rewards belong to the beat that grants them.
  "rewards",
  "reward_pp",
  "reward_gp",
  "reward_ep",
  "reward_sp",
  "reward_cp",
  "reward_item_ids",
  "reward_currency_pools",
  "reward_art_objects",
  // #799 — the flag that declared the flow migration complete while both
  // stores were still taking writes.
  "flow_enabled_at",
] as const;

/**
 * The row without any column the live `quests` table no longer has.
 *
 * Returns a new object; the input is not modified. Anything not on the retired
 * list travels through untouched, so a column added later needs no change here.
 */
export function stripRetiredQuestColumns<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!(RETIRED_QUEST_COLUMNS as readonly string[]).includes(key)) kept[key] = value;
  }
  return kept;
}

/** Exported for the test that holds this list against the live schema. */
export { RETIRED_QUEST_COLUMNS };
