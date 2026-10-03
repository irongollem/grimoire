import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import { useDebounceFn } from "@vueuse/core";

export type AutosaveStatus = "saved" | "dirty" | "saving" | "error" | "paused";

export interface UseAutosaveOptions<T extends object> {
  /** The reactive draft the form binds to. The composable watches it; it never replaces it. */
  draft: T;
  /** The saved value: what the draft starts from, and what `reset()` returns to. */
  initial: () => T;
  equal: (a: T, b: T) => boolean;
  /** Receives a snapshot taken at the moment of saving, not the live draft. */
  save: (snapshot: T) => Promise<void>;
  /** False pauses autosave without discarding edits (a blank required title, say). */
  canSave?: () => boolean;
  /** Debounce in ms. Default 2000. */
  delay?: number;
  /** Ceiling in ms on how long continuous typing can postpone a save. Default 10_000. */
  maxWait?: number;
  /** Shown when `save` rejects with something that is not an Error. */
  errorMessage?: string;
}

export interface UseAutosaveHandle<T extends object> {
  status: ComputedRef<AutosaveStatus>;
  dirty: Ref<boolean>;
  saving: Ref<boolean>;
  saveError: Ref<string>;
  saveNow: () => Promise<void>;
  /** Re-hydrate the draft (from `next`, else `initial()`) without triggering a save. */
  reset: (next?: T) => void;
}

// Plain objects and arrays only: a snapshot must not share nested arrays with the
// live draft, or a later edit would mutate what was "sent". Reads go through the
// reactive proxy, so the copy is a plain, unproxied value.
function cloneDeep<V>(value: V): V {
  if (Array.isArray(value)) return value.map((item) => cloneDeep(item)) as V;
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) copy[key] = cloneDeep(item);
    return copy as V;
  }
  return value;
}

/**
 * Forms that save themselves instead of asking for Save/Cancel. Owns the deep
 * watch, the debounce, the snapshot-and-baseline bookkeeping and the flushes;
 * the component owns everything entity-specific (what `save` sends, whether an
 * incoming prop row is our own echo) and calls `reset()` to re-hydrate.
 */
export function useAutosave<T extends object>(options: UseAutosaveOptions<T>): UseAutosaveHandle<T> {
  const { draft, initial, equal, save, canSave } = options;
  const delay = options.delay ?? 2000;
  const maxWait = options.maxWait ?? 10_000;
  const errorMessage = options.errorMessage ?? "Could not save";

  let baseline = cloneDeep(initial());
  let hydrating = false;
  // Bumped by every `reset()`. A save still in flight when the draft is
  // re-hydrated (a form switching to another record mid-save) belongs to the
  // draft that was replaced, so its result must not become the new baseline.
  let generation = 0;
  const dirty = ref(false);
  const saving = ref(false);
  const saveError = ref("");
  const paused = computed(() => dirty.value && !!canSave && !canSave());

  const status = computed<AutosaveStatus>(() => {
    if (paused.value) return "paused";
    if (saveError.value) return "error";
    if (saving.value) return "saving";
    if (dirty.value) return "dirty";
    return "saved";
  });

  // These are prose boxes, not a search field: 800ms fired inside the pauses of an
  // ordinary sentence, and a 2.5s ceiling meant a write plus a full list refetch
  // every 2.5s of continuous typing. Long enough now to sit out a think-pause,
  // with a ceiling that still bounds what an unexpected close costs.
  const saveLater = useDebounceFn(() => void saveNow(), delay, { maxWait });

  watch(draft, () => {
    if (hydrating) return;
    dirty.value = !equal(draft, baseline);
    if (dirty.value) void saveLater();
  }, { deep: true });

  async function saveNow() {
    if (saving.value || !dirty.value) return;
    if (paused.value) return;
    saving.value = true;
    saveError.value = "";
    const snapshot = cloneDeep(draft);
    const startedIn = generation;
    try {
      await save(snapshot);
      if (startedIn !== generation) return;
      // Baseline is what we *sent*, never the row that came back. A save path
      // typically trims and defaults on the way out, so adopting the saved row
      // would pull those edits into the live draft — that is what yanked the
      // trailing space off the word being typed every time an autosave landed
      // mid-sentence. A draft edited while the request was in flight stays dirty.
      baseline = cloneDeep(snapshot);
      if (equal(draft, snapshot)) dirty.value = false;
    } catch (error) {
      saveError.value = error instanceof Error ? error.message : errorMessage;
    } finally {
      saving.value = false;
      // Not on error: re-queueing a failing save would loop. The next edit retries.
      if (dirty.value && !saveError.value) void saveLater();
    }
  }

  function reset(next?: T) {
    generation++;
    hydrating = true;
    baseline = cloneDeep(next ?? initial());
    Object.assign(draft, cloneDeep(baseline));
    dirty.value = false;
    saveError.value = "";
    hydrating = false;
  }

  // A longer debounce needs a backstop the unmount hook cannot give: closing the tab
  // or backgrounding the app never unmounts, and `visibilitychange` is the last event
  // that still reliably gets to start a request.
  function flushOnHide() {
    if (document.visibilityState === "hidden") void saveNow();
  }
  document.addEventListener("visibilitychange", flushOnHide);

  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", flushOnHide);
    void saveNow();
  });

  return { status, dirty, saving, saveError, saveNow, reset };
}
