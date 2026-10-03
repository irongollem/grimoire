import { computed, reactive, ref, watch, type ComputedRef, type Ref, type UnwrapNestedRefs } from "vue";

/**
 * An editor's local copy of one record, kept honest against the server (#946).
 *
 * Editors used to copy their record into a form once, when they mounted, and
 * save the whole form back. The copy came from whatever the query cache held,
 * which can be minutes stale, and the refetch that followed could not reach the
 * form: change one field, save, and every other field went back to its old
 * value, silently reverting an edit made on another device or by another DM.
 *
 * Two rules close that, and every editor gets both from here:
 *
 * 1. **Save what changed, not what is on screen.** `changes(build)` runs the
 *    editor's own row builder over the draft and over the latest server copy,
 *    and returns only the columns that differ. A field the user never touched
 *    builds to the same value on both sides, so it is never sent, whatever the
 *    server holds now. Comparing built rows rather than draft keys makes it
 *    indifferent to how a form maps onto columns (a draft field that feeds two
 *    columns, a stat block assembled from ten inputs, "" stored as null).
 * 2. **Fresh data reaches the form.** When the source row moves (a refetch, the
 *    campaign channel, a save from elsewhere), each field the user has not
 *    touched takes the new value. A touched field keeps the user's edit; if the
 *    server changed it too, it is listed in `conflicts` so the editor can say
 *    so. A different record (another id) re-seeds the draft from scratch.
 *
 * The draft is a plain `reactive` the template binds to exactly as before. The
 * component still owns everything entity-specific: how a row becomes a draft,
 * how a draft becomes a row, and what happens after a save.
 */

export interface UseRecordDraftOptions<Row, Draft extends object> {
  /** The record as the server last reported it; null/undefined while loading or when creating. */
  source: () => Row | null | undefined;
  /** The record's identity. A new identity is a different record: the draft re-seeds whole. */
  identity: (row: Row) => string;
  /** The form state for a row, or for a new record when `row` is null. Must return fresh objects. */
  toDraft: (row: Row | null) => Draft;
}

export interface UseRecordDraftHandle<Draft extends object> {
  /** Bind the form to this. It is never replaced, only written into. */
  draft: UnwrapNestedRefs<Draft>;
  /** True once a source row has been seeded (always false while creating). */
  seeded: Ref<boolean>;
  /** True when the draft differs from the latest server copy. */
  dirty: ComputedRef<boolean>;
  /** Draft fields the user changed that the server has since changed differently. */
  conflicts: Ref<(keyof Draft)[]>;
  /**
   * The columns to write: `build(draft)` minus every column that `build(server)`
   * produces identically. Empty when there is nothing to save.
   */
  changes: <U extends object>(build: (draft: Draft) => U) => Partial<U>;
  /** After a successful save: the draft as sent becomes the server copy until the refetch confirms it. */
  commit: () => void;
  /** Throw the edits away and show the server copy again. */
  reset: () => void;
}

/** Structural equality over the plain JSON-ish values a form holds. */
export function draftValueEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => draftValueEqual(item, b[i]));
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (!draftValueEqual(left[key], right[key])) return false;
  }
  return true;
}

/** A detached copy: a baseline must never share nested arrays or objects with the live draft. */
export function cloneDraftValue<V>(value: V): V {
  if (Array.isArray(value)) return value.map((item) => cloneDraftValue(item)) as V;
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = cloneDraftValue(item);
    return copy as V;
  }
  return value;
}

/**
 * The columns of `built` that differ from `baseline`. Exported for the editors
 * that cannot use the composable whole (a dialog seeded from a list row) but
 * still save through the same rule.
 */
export function changedColumns<U extends object>(built: U, baseline: U): Partial<U> {
  const out: Partial<U> = {};
  for (const key of Object.keys(built) as (keyof U)[]) {
    if (!draftValueEqual(built[key], baseline[key])) out[key] = built[key];
  }
  return out;
}

/**
 * Merge a fresh server draft into the live one, field by field. Returns the
 * fields both sides changed. Exported for testing.
 */
export function mergeDraft<Draft extends object>(live: Draft, baseline: Draft, incoming: Draft): (keyof Draft)[] {
  const conflicts: (keyof Draft)[] = [];
  for (const key of Object.keys(incoming) as (keyof Draft)[]) {
    const touched = !draftValueEqual(live[key], baseline[key]);
    if (!touched) {
      if (!draftValueEqual(live[key], incoming[key])) live[key] = cloneDraftValue(incoming[key]);
    } else if (!draftValueEqual(incoming[key], baseline[key]) && !draftValueEqual(incoming[key], live[key])) {
      conflicts.push(key);
    }
  }
  return conflicts;
}

export function useRecordDraft<Row, Draft extends object>(
  options: UseRecordDraftOptions<Row, Draft>,
): UseRecordDraftHandle<Draft> {
  const { source, identity, toDraft } = options;
  const initialRow = source() ?? null;

  const draft = reactive(toDraft(initialRow)) as UnwrapNestedRefs<Draft>;
  const plain = () => draft as unknown as Draft;
  // The server copy as a draft. Not reactive on purpose: `dirty` re-reads it
  // through `baselineVersion`, bumped on every write.
  let baseline: Draft = cloneDraftValue(plain());
  const baselineVersion = ref(0);
  const seeded = ref(initialRow !== null);
  const conflicts = ref<(keyof Draft)[]>([]) as Ref<(keyof Draft)[]>;
  let currentId: string | null = initialRow ? identity(initialRow) : null;

  function setBaseline(next: Draft) {
    baseline = cloneDraftValue(next);
    baselineVersion.value++;
  }

  function reseed(row: Row | null) {
    const next = toDraft(row);
    Object.assign(draft, cloneDraftValue(next));
    setBaseline(next);
    conflicts.value = [];
  }

  watch(source, (row) => {
    if (!row) return;
    const id = identity(row);
    if (id !== currentId) {
      currentId = id;
      seeded.value = true;
      reseed(row);
      return;
    }
    const incoming = toDraft(row);
    const found = mergeDraft(plain(), baseline, incoming);
    setBaseline(incoming);
    conflicts.value = [...new Set([...conflicts.value, ...found])].filter(
      (key) => !draftValueEqual(plain()[key], incoming[key]),
    );
  });

  const dirty = computed(() => {
    void baselineVersion.value;
    return !draftValueEqual(plain(), baseline);
  });

  function changes<U extends object>(build: (d: Draft) => U): Partial<U> {
    return changedColumns(build(plain()), build(cloneDraftValue(baseline)));
  }

  function commit() {
    setBaseline(plain());
    conflicts.value = [];
  }

  function reset() {
    Object.assign(draft, cloneDraftValue(baseline));
    conflicts.value = [];
  }

  return { draft, seeded, dirty, conflicts, changes, commit, reset };
}
