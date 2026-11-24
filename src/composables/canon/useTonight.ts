import { computed } from "vue";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCampaignBeatQuests } from "@/composables/canon/useCampaignBeatQuests";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useTableFacts } from "@/composables/canon/useTableFacts";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useParty } from "@/composables/party/useParty";
import { useQuests } from "@/composables/quests/useQuests";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { activeQuestBeatIds, looseEnds, nothingTonight, scopeHidAll, scopeTonight, tonight } from "@/lib/canon/canonTonight";
import { useCampaignStore } from "@/stores/campaign";
import { useCanonUiStore } from "@/stores/ui/canon";

/**
 * What is waiting for the next session, gathered from the canon under the DM's chosen scope. The Tonight page and the
 * card under the Canon's contents both read it, so they cannot disagree. Only built once every read has answered: a read
 * still missing would show as "nothing waiting".
 */
export function useTonight() {
  const campaignStore = useCampaignStore();
  const campaign = computed(() => campaignStore.activeCampaign);
  const entries = useCanonEntries();
  const clues = useCanonClues();
  const passages = useCanonPassages();
  const forces = useCanonForceData();
  const party = useParty();
  const links = useCampaignLinks();
  const record = useTableFacts();
  const arcs = useCanonArcs();
  const quests = useQuests();
  const beatQuests = useCampaignBeatQuests();
  const locations = useAllLocations();
  const sessions = useCampaignSessions();
  const reads = [entries, clues, passages, forces, party, links, record.facts, arcs, quests, beatQuests, locations, sessions];

  const isLoading = computed(() => reads.some((r) => r.isLoading.value));
  const isError = computed(() => reads.some((r) => r.isError.value));

  const ui = useCanonUiStore();
  const scope = computed({ get: () => ui.tonightScope, set: (v) => (ui.tonightScope = v) });

  const full = computed(() => {
    if (isLoading.value || isError.value || campaign.value === null) return null;
    return tonight({
      entries: entries.data.value ?? [],
      passages: passages.data.value ?? [],
      clues: clues.data.value ?? [],
      steps: forces.data.value?.steps ?? [],
      ticks: forces.data.value?.ticks ?? [],
      party: party.data.value ?? [],
      links: links.data.value ?? [],
      facts: record.facts.data.value ?? [],
    });
  });
  const plan = computed(() =>
    full.value === null
      ? null
      : scopeTonight(full.value, scope.value, {
          currentLocationId: campaign.value?.current_location_id ?? null,
          locations: locations.data.value ?? [],
          activeBeatIds: activeQuestBeatIds(beatQuests.data.value ?? [], quests.data.value ?? []),
        }),
  );
  const ends = computed(() =>
    full.value === null
      ? []
      : looseEnds({
          entries: entries.data.value ?? [],
          clues: clues.data.value ?? [],
          steps: forces.data.value?.steps ?? [],
          entryQuests: forces.data.value?.quests ?? [],
          links: links.data.value ?? [],
          arcs: arcs.data.value ?? [],
          quests: quests.data.value ?? [],
          sessions: sessions.data.value ?? [],
        }),
  );
  // Empty only when the whole canon has nothing; a scope that hides what exists says so under its control instead.
  const nothing = computed(() => full.value !== null && nothingTonight(full.value) && ends.value.length === 0);
  const scopeEmpty = computed(() => full.value !== null && plan.value !== null && scopeHidAll(full.value, plan.value));
  const scopeEmptyText = computed(() =>
    scope.value === "party"
      ? campaign.value?.current_location_id
        ? "No lore or clue is placed where the party is. Choose Everything to see the rest."
        : "The party has no place set, so nothing is placed where they are. Choose Everything to see the rest."
      : "No lore or clue is placed at a beat of an active quest. Choose Everything to see the rest.",
  );

  return { campaign, isLoading, isError, scope, full, plan, ends, nothing, scopeEmpty, scopeEmptyText };
}
