import { computed, ref, shallowRef } from "vue";
import { BUNDLE_ENTITY_TYPES } from "@/composables/campaign/useWorldBundle";
import type { BundleEntityKey } from "@/composables/campaign/useWorldBundle";
import { useAuthStore } from "@/stores/auth";

/**
 * The World Bundle wizard's selection state, shared by the World Bundle tab
 * (a `.grimoire` download) and Scriptorium's "PDF with campaign data" dialog.
 * `BundleEntityPicker` renders it; the host owns it so it can read the result
 * and drive the final "details" step itself.
 *
 * Phases: `categories` (which types) → `pick` (which entities, one type at a
 * time) → `details`, which the host renders.
 */

export type BundlePhase = "categories" | "pick" | "details";

/** Characters import as broken without these, so selecting them force-includes and locks the rest. */
export const CHARACTER_DEPENDENCIES: readonly BundleEntityKey[] = [
  "species", "spells", "custom_classes", "custom_subclasses",
] as const;

export type BundleInitialSelection = Partial<Record<BundleEntityKey, readonly string[]>>;

/**
 * Who a bundle or PDF says it came from (#637). `publicName` is what the party
 * already reads in chat, never the account's email: a bundle is handed to other
 * people and a published PDF's metadata outlives any conversation about it.
 * Undefined rather than a placeholder: `author` is optional in the manifest.
 */
export function useBundleAuthor(): () => string | undefined {
  const authStore = useAuthStore();
  return () => authStore.publicName ?? undefined;
}

export function useBundleSelection(initial: BundleInitialSelection = {}) {
  const phase = ref<BundlePhase>("categories");
  const pickIndex = ref(0);

  const initialEntries = BUNDLE_ENTITY_TYPES.map((t) => t.key).filter(
    (k) => (initial[k]?.length ?? 0) > 0,
  );
  const selectedCategories = shallowRef<Set<BundleEntityKey>>(new Set(initialEntries));
  const entitySelections = shallowRef<Partial<Record<BundleEntityKey, Set<string>>>>(
    Object.fromEntries(initialEntries.map((k) => [k, new Set(initial[k])])),
  );
  if (selectedCategories.value.has("party_members")) {
    selectedCategories.value = new Set([...selectedCategories.value, ...CHARACTER_DEPENDENCIES]);
  }

  /** Selected categories in `BUNDLE_ENTITY_TYPES` order. */
  const orderedCategories = computed<BundleEntityKey[]>(() =>
    BUNDLE_ENTITY_TYPES.map((t) => t.key).filter((k) => selectedCategories.value.has(k)),
  );

  const currentPickKey = computed<BundleEntityKey | null>(() =>
    phase.value === "pick" ? (orderedCategories.value[pickIndex.value] ?? null) : null,
  );

  const isLastPick = computed(() => pickIndex.value === orderedCategories.value.length - 1);

  const currentSelection = computed<Set<string>>(() => {
    const key = currentPickKey.value;
    return (key ? entitySelections.value[key] : undefined) ?? new Set<string>();
  });

  /** Selected entities as a {type → ids} map, the shape `buildBundle` takes. */
  const selectionMap = computed<Map<BundleEntityKey, string[]>>(() => {
    const map = new Map<BundleEntityKey, string[]>();
    for (const key of orderedCategories.value) {
      const sel = entitySelections.value[key];
      if (sel && sel.size > 0) map.set(key, [...sel]);
    }
    return map;
  });

  // Counted from what will be exported: an unticked category keeps its picks
  // (ticking it again restores them) but contributes nothing to the bundle,
  // so it must not enable an export that would come out empty.
  const totalSelected = computed(() => [...selectionMap.value.values()].reduce((sum, ids) => sum + ids.length, 0));

  function isLocked(key: BundleEntityKey): boolean {
    return CHARACTER_DEPENDENCIES.includes(key) && selectedCategories.value.has("party_members");
  }

  function toggleCategory(key: BundleEntityKey) {
    if (isLocked(key)) return;
    const next = new Set(selectedCategories.value);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
      if (key === "party_members") for (const dep of CHARACTER_DEPENDENCIES) next.add(dep);
    }
    selectedCategories.value = next;
  }

  function setSelection(key: BundleEntityKey, ids: Set<string>) {
    entitySelections.value = { ...entitySelections.value, [key]: ids };
  }

  function toggleEntity(id: string) {
    const key = currentPickKey.value;
    if (!key) return;
    const next = new Set(currentSelection.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelection(key, next);
  }

  function selectAll(ids: readonly string[]) {
    const key = currentPickKey.value;
    if (key) setSelection(key, new Set(ids));
  }

  function selectNone() {
    const key = currentPickKey.value;
    if (key) setSelection(key, new Set());
  }

  /**
   * Drop selected ids the picker does not offer for `key`. A preselection can
   * name an entity that is not campaign data (a shared-library monster a book
   * links), and it must not travel in the bundle or inflate the count.
   */
  function pruneTo(key: BundleEntityKey, availableIds: readonly string[]) {
    const current = entitySelections.value[key];
    if (!current) return;
    const available = new Set(availableIds);
    const kept = new Set([...current].filter((id) => available.has(id)));
    if (kept.size !== current.size) setSelection(key, kept);
  }

  function goToFirstPick() {
    pickIndex.value = 0;
    phase.value = "pick";
  }

  function goNext() {
    if (isLastPick.value) phase.value = "details";
    else pickIndex.value++;
  }

  function goBack() {
    if (phase.value === "details") {
      pickIndex.value = orderedCategories.value.length - 1;
      phase.value = "pick";
    } else if (phase.value === "pick") {
      if (pickIndex.value > 0) pickIndex.value--;
      else phase.value = "categories";
    }
  }

  return {
    phase,
    pickIndex,
    selectedCategories,
    entitySelections,
    orderedCategories,
    currentPickKey,
    currentSelection,
    isLastPick,
    totalSelected,
    selectionMap,
    isLocked,
    toggleCategory,
    toggleEntity,
    selectAll,
    selectNone,
    pruneTo,
    goToFirstPick,
    goNext,
    goBack,
  };
}

export type BundleSelection = ReturnType<typeof useBundleSelection>;
