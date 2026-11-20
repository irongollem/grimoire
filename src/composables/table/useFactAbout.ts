import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useLocationNames } from "@/composables/locations/useLocations";
import { useNpcNames } from "@/composables/npcs/useNpcFields";
import { useQuests } from "@/composables/quests/useQuests";
import { searchRoute } from "@/lib/search/searchRoute";
import { ABOUT_FALLBACK, factAbout, type StoryFactLink } from "@/lib/table/solo/storyRecord";

/**
 * What each fact is about, named and routed: the chips on a record line. Names come through the readers the rest of the
 * app uses, once for the whole page and never once per fact. Shared by the story view and the Canon page's "What the
 * table added", which show the same lines.
 */
export function useFactAbout(links: MaybeRefOrGetter<readonly StoryFactLink[]>) {
  const byFact = computed(() => {
    const map = new Map<string, StoryFactLink[]>();
    for (const link of toValue(links)) map.set(link.fact_id, [...(map.get(link.fact_id) ?? []), link]);
    return map;
  });
  const all = computed(() => factAbout(toValue(links)));
  const npcNames = useNpcNames(() => all.value.filter((a) => a.kind === "npc").map((a) => a.id));
  const placeIds = computed(() => [...new Set(all.value.filter((a) => a.kind === "location").map((a) => a.id))]);
  const placeNames = useLocationNames(placeIds);
  const quests = useQuests();

  function nameOf(kind: "npc" | "location" | "quest", id: string): string {
    if (kind === "npc") return npcNames.data.value?.get(id) ?? ABOUT_FALLBACK.npc;
    if (kind === "location") return placeNames.value.get(id) ?? ABOUT_FALLBACK.location;
    return quests.data.value?.find((q) => q.id === id)?.title ?? ABOUT_FALLBACK.quest;
  }

  return (factId: string) =>
    factAbout(byFact.value.get(factId) ?? []).map((item) => ({ ...item, label: nameOf(item.kind, item.id), to: searchRoute(item.kind, item.id) }));
}
