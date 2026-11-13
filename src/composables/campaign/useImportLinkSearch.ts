/**
 * The search behind "Link to something else…" in an import review: the DM knows
 * they own the thing under another name, so they look it up themselves instead
 * of choosing among what the matcher suggested.
 *
 * Global search does the finding for every kind it knows (the campaign, plus the
 * enabled library books for monsters, items and spells); encounters are not a
 * global-search kind, so they are filtered here from the campaign's own list.
 */
import { computed, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import { useGlobalSearch } from "@/composables/useGlobalSearch";
import { useEncounters } from "@/composables/encounters/useEncounters";
import type { SearchKind } from "@/lib/search/searchRoute";
import type { SearchGroup } from "@/lib/search/mergeSearchHits";
import type { EntityCandidate } from "@/lib/documentImport/entityMatching";
import { isUuid } from "@/lib/library/contentIdentity";
import type { ImportEntityKind } from "@/types/documentImport.types";

/** Global-search kinds each import kind may link to. Quests are never linked. */
const SEARCH_KINDS_BY_IMPORT_KIND: Partial<Record<ImportEntityKind, readonly SearchKind[]>> = {
  npcs: ["npc", "deity"],
  factions: ["faction"],
  locations: ["location"],
  monsters: ["monster"],
  items: ["item"],
  spells: ["spell"],
};

const ENCOUNTER_CAP = 20;

/** A search hit as the candidate a decision holds. */
export function hitToCandidate(
  hitKind: string,
  hit: { id: string; name: string; detail?: string | null; descriptor?: string | null },
): EntityCandidate {
  return {
    targetId: hit.id,
    source: hitKind === "deity" ? "deity" : isUuid(hit.id) ? "campaign" : "library",
    name: hit.name,
    matchKind: "chosen",
    detail: hit.detail ?? hit.descriptor ?? null,
    distance: null,
  };
}

export function useImportLinkSearch(kind: MaybeRefOrGetter<ImportEntityKind>, query: Ref<string>) {
  const allowed = computed(() => SEARCH_KINDS_BY_IMPORT_KIND[toValue(kind)] ?? []);
  const isEncounters = computed(() => toValue(kind) === "encounters");

  // An empty kind list reads nothing, so the encounter and quest cases cost no search.
  const search = useGlobalSearch(query, { kinds: allowed });
  const encounters = useEncounters();

  const groups = computed<SearchGroup[]>(() => {
    const needle = query.value.trim().toLowerCase();
    if (needle.length < 2) return [];
    if (isEncounters.value) {
      const items = (encounters.data.value ?? [])
        .filter((e) => e.name.toLowerCase().includes(needle))
        .slice(0, ENCOUNTER_CAP)
        .map((e) => ({ id: e.id, name: e.name, route: "", matchedBy: "name" as const }));
      return items.length > 0 ? [{ type: "encounter", label: "Encounters", items }] : [];
    }
    return (search.data.value?.groups ?? [])
      .map((group) => ({ ...group, items: group.items.filter((item) => allowed.value.includes((item.kind ?? group.type) as SearchKind)) }))
      .filter((group) => group.items.length > 0);
  });

  return {
    groups,
    isFetching: computed(() => (isEncounters.value ? encounters.isFetching.value : search.isFetching.value)),
    isError: computed(() => (isEncounters.value ? encounters.isError.value : search.isError.value)),
    isSemanticPending: computed(() => !isEncounters.value && search.isSemanticPending.value),
    thumbnails: search.thumbnails,
  };
}
