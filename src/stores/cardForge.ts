import { defineStore } from "pinia";
import { ref, shallowRef, watch } from "vue";
import { useLocalStorage } from "@vueuse/core";

export type CardSizeId = "mtg" | "tarot";
export type CardStyleId = "inked" | "modern";
export type CardModeId = "collection" | "loot";
export type SourceId = "npcs" | "monsters" | "items" | "spells" | "downtime";

export type CardKind = "npc" | "monster" | "item" | "spell" | "downtime" | "downtime-seed";

export interface CardCollection {
  id: string;
  name: string;
  created: string;
  items: Array<{ kind: CardKind; id: string }>;
}

/**
 * Card kind → source tab. Explicit rather than `kind + "s"`: the downtime source
 * is "downtime", not "downtimes", and a silent mis-pluralisation would drop a
 * whole bucket of a saved collection on load.
 */
const KIND_TO_SOURCE: Record<CardKind, SourceId> = {
  npc: "npcs",
  monster: "monsters",
  item: "items",
  spell: "spells",
  // Activity cards and their outcome cards share one tab and one bucket: they
  // are two halves of the same deck, and you print them together.
  downtime: "downtime",
  "downtime-seed": "downtime",
};

function emptyBuckets(): Record<SourceId, Set<string>> {
  return {
    npcs: new Set(),
    monsters: new Set(),
    items: new Set(),
    spells: new Set(),
    downtime: new Set(),
  };
}

const LIBRARY_KEY = "cardforge_library";
const STYLE_KEY = "cardforge_style";
const MODE_KEY = "cardforge_mode";
const DECK_BACK_KEY = "cardforge_deck_back";

const PAGE_STYLE_ID = "cardforge-page-rule";

export const useCardForgeStore = defineStore("cardForge", () => {
  const source = ref<SourceId>("npcs");
  const search = ref("");

  const selectedIds = shallowRef<Record<SourceId, Set<string>>>(emptyBuckets());

  const cardSize = ref<CardSizeId>("mtg");
  const cardStyle = useLocalStorage<CardStyleId>(STYLE_KEY, "inked");

  /** "collection" = mixed cards, full front+back per item.
   *  "loot"       = items only, all info on front, shared back image. */
  const mode = useLocalStorage<CardModeId>(MODE_KEY, "collection");
  /** Deck back id (used when mode === 'loot'). See loot/deckBacks.ts. */
  const lootDeckBackId = useLocalStorage<string>(
    DECK_BACK_KEY,
    "arcane-vortex",
  );

  const showSaveModal = ref(false);
  const showLoadModal = ref(false);

  const library = useLocalStorage<CardCollection[]>(LIBRARY_KEY, []);

  /** In loot mode the source is always items — force it on entry. */
  watch(
    mode,
    (m) => {
      if (m === "loot") source.value = "items";
    },
    { immediate: true },
  );

  function toggleSelect(id: string) {
    const src = source.value;
    const next = new Set(selectedIds.value[src]);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = { ...selectedIds.value, [src]: next };
  }

  function selectAllInSource(ids: string[]) {
    const src = source.value;
    const next = new Set([...selectedIds.value[src], ...ids]);
    selectedIds.value = { ...selectedIds.value, [src]: next };
  }

  function clearSourceSelection() {
    selectedIds.value = { ...selectedIds.value, [source.value]: new Set() };
  }

  function saveCollection(
    name: string,
    items: CardCollection["items"],
  ) {
    const trimmed = name.trim();
    if (!trimmed) return;
    library.value = [
      {
        id: crypto.randomUUID(),
        name: trimmed,
        created: new Date().toISOString(),
        items,
      },
      ...library.value,
    ];
    showSaveModal.value = false;
  }

  function loadCollection(col: CardCollection) {
    const buckets = emptyBuckets();
    for (const it of col.items) {
      const key = KIND_TO_SOURCE[it.kind];
      // A collection saved by a newer build may name a kind this one doesn't
      // know — skip it rather than throw away the whole load.
      if (key) buckets[key].add(it.id);
    }
    selectedIds.value = buckets;

    // Switch to the tab with the most loaded cards
    const counts = Object.entries(buckets).map(
      ([src, ids]) => [src, ids.size] as const,
    );
    source.value =
      (counts.sort(([, a], [, b]) => b - a)[0]?.[0] as SourceId) ?? "npcs";
    showLoadModal.value = false;
  }

  function deleteCollection(id: string) {
    library.value = library.value.filter((c) => c.id !== id);
  }

  /**
   * Load a set of NPCs into the forge selection and focus the NPC source.
   * Used by "Export to Card Forge" from an NPC set so the DM lands here with
   * the whole set already ticked — no manual re-selection. Forces collection
   * mode (loot mode is items-only) and replaces any prior NPC selection.
   */
  function loadNpcIds(ids: string[]) {
    mode.value = "collection";
    source.value = "npcs";
    selectedIds.value = { ...selectedIds.value, npcs: new Set(ids) };
  }

  /**
   * Inject `@page` into <head> at call-time and trigger native print.
   * Safari sometimes ignores `@page` rules sourced from component stylesheets;
   * a head-level <style> is always honored.
   */
  function printCards() {
    if (!document.getElementById(PAGE_STYLE_ID)) {
      const s = document.createElement("style");
      s.id = PAGE_STYLE_ID;
      s.textContent = "@page { size: A4 portrait; margin: 0; }";
      document.head.appendChild(s);
    }
    window.print();
  }

  return {
    source,
    search,
    selectedIds,
    cardSize,
    cardStyle,
    mode,
    lootDeckBackId,
    showSaveModal,
    showLoadModal,
    library,
    toggleSelect,
    selectAllInSource,
    clearSourceSelection,
    saveCollection,
    loadCollection,
    deleteCollection,
    loadNpcIds,
    printCards,
  };
});
