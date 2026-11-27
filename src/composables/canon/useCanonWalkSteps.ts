import { computed } from "vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCampaignPeoples } from "@/composables/canon/useCampaignPeoples";
import { useSpeciesNames } from "@/composables/canon/useSpeciesNames";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { useCanonWalkSkips } from "@/composables/canon/useCanonWalkSkips";
import { useParty } from "@/composables/party/useParty";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useAuthStore } from "@/stores/auth";
import { membersNoted, walkStops, walkSteps } from "@/lib/canon/canonWalk";

/**
 * "Design it with me" as the page reads it (#1282): the steps with their states, from the canon and what is kept beside
 * it. One place, so the walk and the Canon page's invitation to it never disagree about what is filled.
 */
export function useCanonWalkSteps() {
  const entriesQuery = useCanonEntries();
  const cluesQuery = useCanonClues();
  const { data: arcs } = useCanonArcs();
  const { peoples } = useCampaignPeoples();
  const { species } = useSpeciesNames();
  const { habitats } = useCampaignHabitats();
  const { data: partyData } = useParty();
  const { skipped, isSuccess: skipsLoaded } = useCanonWalkSkips();
  const passagesQuery = useCanonPassages();
  const auth = useAuthStore();

  const entries = computed(() => entriesQuery.data.value ?? []);
  const clues = computed(() => cluesQuery.data.value ?? []);
  const arcList = computed(() => arcs.value ?? []);
  const party = computed(() => (partyData.value ?? []).map((m) => ({ id: m.id, name: m.name })));
  /** The characters the signed-in DM has written notes for: a backstory stop is filled by those, not by the entry existing. */
  const notedIds = computed(() => membersNoted(entries.value, passagesQuery.data.value ?? [], auth.user?.id ?? null));
  const steps = computed(() =>
    walkSteps({
      entries: entries.value,
      clues: clues.value,
      arcCount: arcList.value.length,
      peopleCount: peoples.value.length,
      speciesCount: species.value.length,
      habitatCount: habitats.value.length,
      party: party.value,
      notedIds: notedIds.value,
      skipped: skipped.value,
    }),
  );
  /** Only once the canon, its clues and the skips are in, or a canon on its way would read as empty. */
  const loaded = computed(() => !entriesQuery.isLoading.value && !entriesQuery.isError.value && cluesQuery.isSuccess.value && skipsLoaded.value && passagesQuery.data.value !== undefined);
  /** Every stop of the walk (the backstories once per character), with its state. */
  const stops = computed(() => walkStops(steps.value, party.value, notedIds.value));
  return { entries, clues, arcs: arcList, steps, stops, loaded, isLoading: entriesQuery.isLoading, isError: entriesQuery.isError };
}
