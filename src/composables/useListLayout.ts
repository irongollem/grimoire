import { computed, effectScope, type WritableComputedRef } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

/**
 * How a list shows its items: one per row, or as a grid of cards. Every catalogue
 * list offers both, so the choice is the same word everywhere. (`ListSkeleton`'s
 * `gallery` variant is a skeleton shape, not a layout value.)
 */
export type ListLayout = "rows" | "grid";

const isListLayout = (value: unknown): value is ListLayout =>
  value === "rows" || value === "grid";

// One storage key for every list, holding `{ [listKey]: layout }`. A single
// shared ref (made on first use, so nothing touches storage at import) means
// the page header's toggle and the list body, which both call `useListLayout`
// with the same key, always see the same value.
//
// It is made in a detached effect scope, not in the calling component's: the
// ref outlives the first page that asked for it, and `useStorage`'s
// write-through watcher belongs to whichever scope creates it. Made inside
// /npcs, it stopped writing the moment the DM left for /monsters, so every
// choice after that lived in memory only and was gone on reload.
let layouts: ReturnType<typeof useStorage<Record<string, ListLayout>>> | null = null;

function store() {
  if (!layouts) {
    const created = effectScope(true).run(() =>
      useStorage<Record<string, ListLayout>>("grimoire:list-layouts", {}, safeLocalStorage()),
    );
    if (!created) throw new Error("useListLayout: the detached scope did not run");
    layouts = created;
  }
  return layouts;
}

/**
 * The persisted layout of one list, as a writable ref. `listKey` names the list
 * ("npcs", "monsters"); `defaultLayout` is what a first visit gets, and what an
 * unrecognised stored value falls back to. Call it with the same key from the
 * page header (for `<ListLayoutToggle v-model>`) and from the list body.
 */
export function useListLayout(
  listKey: string,
  defaultLayout: ListLayout,
): WritableComputedRef<ListLayout> {
  const all = store();
  return computed({
    get: () => {
      const stored: unknown = all.value[listKey];
      return isListLayout(stored) ? stored : defaultLayout;
    },
    set: (value) => {
      all.value = { ...all.value, [listKey]: value };
    },
  });
}
