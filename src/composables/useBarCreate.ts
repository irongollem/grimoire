import { computed, onScopeDispose, shallowRef, toValue, type MaybeRefOrGetter } from "vue";

/**
 * The page's own create action, lent to the DM bottom bar.
 *
 * The bar's gold "+" (Prep) and the More sheet's "New …" (Play) create in the
 * section on screen. They used to read a hand-kept map of route prefixes to
 * create routes, which went stale the way such maps do: a section left out of
 * it (Campaign Notes, Encounters, Book Nook, Pantheons, Crafting, Rules, the
 * Codex, the Hall of Heroes) opened the More sheet instead of creating, and the
 * routes it did know bypassed the page's own quota gate. Now the page says what
 * "new" means here, through the same handler as its own button, so the two
 * cannot disagree. `ListCreateButton` registers itself; a page whose create has
 * no header button (the NPC phone layout, the soundboard) calls this directly.
 *
 * Registration lives for the calling scope. When several are live (a leaving
 * page's scope outlasting the arriving one's setup), the newest that currently
 * offers an action wins; a getter returning null steps aside without leaving.
 */
export interface BarCreateAction {
  label: string;
  run: () => void;
}

interface Entry {
  id: number;
  get: () => BarCreateAction | null;
}

/**
 * Whether the DM bottom bar is mounted (it renders for DMs only). A page's own
 * "New …" button hides where the bar shows, since the bar's "+" runs it; for a
 * player, or anywhere the bar is not drawn, the button stays.
 */
export const barNavMounted = shallowRef(false);

let nextId = 0;
const entries = shallowRef<Entry[]>([]);

/** The create action the bar offers now, or null when the page has none. */
export const barCreateAction = computed<BarCreateAction | null>(() => {
  for (let i = entries.value.length - 1; i >= 0; i--) {
    const action = entries.value[i].get();
    if (action) return action;
  }
  return null;
});

export function useBarCreate(action: MaybeRefOrGetter<BarCreateAction | null>): void {
  const id = ++nextId;
  entries.value = [...entries.value, { id, get: () => toValue(action) }];
  onScopeDispose(() => {
    entries.value = entries.value.filter((e) => e.id !== id);
  });
}
