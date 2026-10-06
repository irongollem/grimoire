import { computed, watch, toValue, type MaybeRefOrGetter } from "vue";
import { useSharedLocations } from "@/composables/locations/useLocations";
import { usePlayerSessions } from "@/composables/sessions/usePlayerSessions";
import { usePlayerNpcRatings } from "@/composables/play/usePlayerNpcRatings";
import { getNpcDisplayName } from "@/lib/npcDisplay";
import { buildPeopleGroups } from "@/lib/npcs/peopleLedger";
import { defaultSortDir, effectivePeopleSort, type PlayerNpcSortField } from "@/lib/npcs/playerNpcSort";
import { useUiStore } from "@/stores/ui";
import type { PlayerNpc } from "@/types/npc.types";

export interface PeoplePlace {
  id: string;
  name: string;
  count: number;
}

export const PEOPLE_SORT_OPTIONS = [
  { value: "rating", label: "Rating" },
  { value: "revealed", label: "Met" },
  { value: "location", label: "Place" },
  { value: "name", label: "Name" },
] as const satisfies readonly { value: PlayerNpcSortField; label: string }[];

/**
 * The player People page's search, sort, filter and grouping, over the people
 * the ledger holds. Filter state lives in `useUiStore`, so it survives
 * navigation; this only reads it.
 */
export function usePlayerPeople(
  allNpcs: MaybeRefOrGetter<readonly PlayerNpc[]>,
  ledgerNpcs: MaybeRefOrGetter<readonly PlayerNpc[]>,
) {
  const ui = useUiStore();
  const { data: sharedLocations } = useSharedLocations();
  const { getRating, ratingTick } = usePlayerNpcRatings(() => [...toValue(allNpcs)]);

  const { data: sessions, isLoading: sessionsLoading } = usePlayerSessions();
  const sessionsById = computed(() => new Map((sessions.value ?? []).map((s) => [s.id, s])));

  const locationsById = computed(() => new Map((sharedLocations.value ?? []).map((l) => [l.id, l])));

  /** The player-visible place, with its parent when the party knows that too. */
  function place(npc: PlayerNpc): { id: string; name: string; within: string | null } | null {
    if (!npc.player_visible_fields.includes("location") || !npc.location_id) return null;
    const loc = locationsById.value.get(npc.location_id);
    if (!loc) return null;
    const parent = loc.parent_id ? locationsById.value.get(loc.parent_id) : undefined;
    return { id: loc.id, name: loc.name, within: parent?.name ?? null };
  }

  const places = computed<PeoplePlace[]>(() => {
    const counts = new Map<string, PeoplePlace>();
    for (const npc of toValue(allNpcs)) {
      const p = place(npc);
      if (!p) continue;
      const row = counts.get(p.id);
      if (row) row.count += 1;
      else counts.set(p.id, { id: p.id, name: p.name, count: 1 });
    }
    return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
  });

  // "Place" is hidden when nobody has a visible place; a stored "location" then
  // sorts by rating without rewriting the store.
  const sortOptions = computed(() =>
    places.value.length ? PEOPLE_SORT_OPTIONS : PEOPLE_SORT_OPTIONS.filter((o) => o.value !== "location"),
  );
  const effectiveSort = computed(() =>
    effectivePeopleSort(ui.playerPeopleSortBy, ui.playerPeopleSortDir, places.value.length > 0),
  );
  const effectiveSortBy = computed<PlayerNpcSortField>({
    get: () => effectiveSort.value.field,
    set: (field) => {
      ui.playerPeopleSortBy = field;
    },
  });
  watch(
    () => ui.playerPeopleSortBy,
    (field) => {
      ui.playerPeopleSortDir = defaultSortDir(field);
    },
  );

  function matches(npc: PlayerNpc): boolean {
    const q = ui.playerPeopleSearch.trim().toLowerCase();
    if (q) {
      const visible = (f: string) => npc.player_visible_fields.includes(f);
      const parts = [
        visible("name") ? getNpcDisplayName(npc) : null,
        visible("race") ? npc.race : null,
        visible("occupation") ? npc.occupation : null,
      ];
      if (!parts.some((p) => p?.toLowerCase().includes(q))) return false;
    }
    // Relationship and status are always shown to players (unknown = soft-hidden),
    // so they are not gated on player_visible_fields.
    if (ui.playerPeopleFilterRelationship !== "all" && npc.relationship !== ui.playerPeopleFilterRelationship) {
      return false;
    }
    if (ui.playerPeopleFilterStatus !== "all" && npc.status !== ui.playerPeopleFilterStatus) return false;
    if (ui.playerPeopleFilterLocation && npc.location_id !== ui.playerPeopleFilterLocation) return false;
    return true;
  }

  /** Filters that live in the sheet on a phone (search stays on the page). */
  const activeFilterCount = computed(
    () =>
      Number(ui.playerPeopleFilterRelationship !== "all") +
      Number(ui.playerPeopleFilterStatus !== "all") +
      Number(ui.playerPeopleFilterLocation !== ""),
  );

  const filtered = computed(() => toValue(ledgerNpcs).filter(matches));
  /**
   * "Met" groups by session, so nothing is grouped until the session labels are
   * in: a ledger sorted before them would file everyone under "Before the log"
   * for a beat. `people` stays whole meanwhile, so the empty copy cannot flash.
   */
  const groupsPending = computed(() => effectiveSortBy.value === "revealed" && sessionsLoading.value);
  const groups = computed(() => {
    void ratingTick.value;
    if (groupsPending.value) return [];
    return buildPeopleGroups(filtered.value, effectiveSortBy.value, effectiveSort.value.dir, {
      getRating,
      place,
      sessionOf: (id) => sessionsById.value.get(id) ?? null,
    });
  });
  const people = computed(() => (groupsPending.value ? filtered.value : groups.value.flatMap((g) => g.people)));

  return {
    getRating,
    ratingTick,
    place,
    places,
    sortOptions,
    effectiveSortBy,
    activeFilterCount,
    groups,
    groupsPending,
    people,
  };
}
