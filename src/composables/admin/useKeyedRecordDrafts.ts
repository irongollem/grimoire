import { reactive } from "vue";
import { changedColumns, cloneDraftValue, draftValueEqual, mergeDraft } from "@/composables/useRecordDraft";

/**
 * `useRecordDraft` for a screen that edits many rows of one table, each with
 * its own Save button (#946): the admin plans, prompts, providers and pricing
 * tabs. One `useRecordDraft` holds a single record and `commit()` rebaselines
 * all of it, so saving row A would mark row B's unsaved edits as "untouched"
 * and the next refetch would overwrite them. Here every row has its own
 * baseline, so a save, a conflict or a reset touches that row alone.
 *
 * The merge rules are the composable's own (`mergeDraft`): an untouched field
 * takes the server's new value, a touched field keeps the edit, and a field
 * both sides moved is listed in `conflicts`.
 */
export function useKeyedRecordDrafts<Row, Draft extends object>(toDraft: (row: Row) => Draft) {
  const drafts = reactive<Record<string, Draft>>({}) as Record<string, Draft>;
  const conflicts = reactive<Record<string, (keyof Draft)[]>>({}) as Record<string, (keyof Draft)[]>;
  // The server copy per row, as a draft. Not reactive: nothing renders from it.
  const baselines: Record<string, Draft> = {};

  /** Feed a row as the server last reported it: seeds a new key, merges into a known one. */
  function sync(key: string, row: Row) {
    const incoming = toDraft(row);
    const live = drafts[key];
    const base = baselines[key];
    if (!live || !base) {
      drafts[key] = cloneDraftValue(incoming);
      baselines[key] = cloneDraftValue(incoming);
      return;
    }
    const found = mergeDraft(live, base, incoming);
    baselines[key] = cloneDraftValue(incoming);
    conflicts[key] = [...new Set([...(conflicts[key] ?? []), ...found])].filter(
      (field) => !draftValueEqual(live[field], incoming[field]),
    );
  }

  /** The latest server copy of a row, or undefined before it has been synced. */
  function baseline(key: string): Draft | undefined {
    return baselines[key];
  }

  /**
   * The columns of `build(draft)` that differ from `build(server copy)`. `build`
   * must be pure: it runs over both sides.
   */
  function changes<U extends object>(key: string, build: (d: Draft) => U): Partial<U> {
    const live = drafts[key];
    const base = baselines[key];
    if (!live || !base) return {};
    return changedColumns(build(live), build(cloneDraftValue(base)));
  }

  /** After a successful save of row `key`: what was sent becomes its server copy until the refetch confirms. */
  function commit(key: string) {
    const live = drafts[key];
    if (!live) return;
    baselines[key] = cloneDraftValue(live);
    conflicts[key] = [];
  }

  /** Throw row `key`'s edits away and show its server copy. */
  function reset(key: string) {
    const base = baselines[key];
    const live = drafts[key];
    if (!base || !live) return;
    Object.assign(live, cloneDraftValue(base));
    conflicts[key] = [];
  }

  return { drafts, conflicts, sync, baseline, changes, commit, reset };
}
