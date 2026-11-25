import { computed } from "vue";
import { useCanonArcs } from "@/composables/canon/useCanonArcs";
import { useCampaignBeatQuests } from "@/composables/canon/useCampaignBeatQuests";
import { useCanonClues } from "@/composables/canon/useCanonClues";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useCanonForceData } from "@/composables/canon/useCanonForces";
import { useCanonPassages } from "@/composables/canon/useCanonPassages";
import { useTableFacts } from "@/composables/canon/useTableFacts";
import { useTonightPins, useTonightPlanLine } from "@/composables/canon/useTonightPlan";
import { useWorldToday } from "@/composables/canon/useWorldToday";
import { useCampaignLinks } from "@/composables/connections/useConnections";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useParty } from "@/composables/party/useParty";
import { useQuests } from "@/composables/quests/useQuests";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { TONIGHT_SCOPES, activeQuestBeatIds, looseEnds, nothingTonight, plannedItems, scopeCounts, scopeHidAll, scopeTonight, tonight } from "@/lib/canon/canonTonight";
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
  const npcs = useNpcs();
  const today = useWorldToday();
  // The plan is the DM's own and optional: it never gates the page, it fills in when it arrives.
  const pins = useTonightPins();
  const planLine = useTonightPlanLine();
  const reads = [entries, clues, passages, forces, party, links, record.facts, arcs, quests, beatQuests, locations, sessions, npcs];

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
      today: today.value,
    });
  });
  const scopeContext = computed(() => ({
    currentLocationId: campaign.value?.current_location_id ?? null,
    locations: locations.data.value ?? [],
    activeBeatIds: activeQuestBeatIds(beatQuests.data.value ?? [], quests.data.value ?? []),
    npcLocationIds: new Map((npcs.data.value ?? []).map((n) => [n.id, n.location_id])),
  }));
  const plan = computed(() => (full.value === null ? null : scopeTonight(full.value, scope.value, scopeContext.value)));
  /** The scope control only means something when there is lore or a clue for it to narrow. */
  const showScope = computed(() => full.value !== null && (full.value.lore.length > 0 || full.value.clues.length > 0));
  /** Each option, with how many lore passages and clues it holds. */
  const scopeOptions = computed(() => {
    const counts = full.value === null ? null : scopeCounts(full.value, scopeContext.value);
    return TONIGHT_SCOPES.map((o) => ({ value: o.id, label: counts === null ? o.label : `${o.label} · ${counts[o.id]}` }));
  });
  const noPlace = computed(() => scope.value === "party" && !campaign.value?.current_location_id);
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
  /** What the DM pinned, resolved against the whole canon (a scope never cuts a pin). */
  const planned = computed(() =>
    full.value === null
      ? []
      : plannedItems(pins.data.value ?? [], {
          entries: entries.data.value ?? [],
          passages: passages.data.value ?? [],
          clues: clues.data.value ?? [],
          steps: forces.data.value?.steps ?? [],
        }),
  );
  // Empty only when the whole canon has nothing; a scope that hides what exists says so under its control instead.
  const nothing = computed(() => full.value !== null && nothingTonight(full.value) && ends.value.length === 0 && planned.value.length === 0 && !planLine.data.value);
  const scopeEmpty = computed(() => full.value !== null && plan.value !== null && scopeHidAll(full.value, plan.value));
  const scopeEmptyText = computed(() =>
    scope.value === "party"
      ? campaign.value?.current_location_id
        ? "No lore or clue is placed where the party is. Choose Everything to see the rest."
        : "The party has no place set, so nothing is placed where they are. Choose Everything to see the rest."
      : "No lore or clue is placed at a beat of an active quest. Choose Everything to see the rest.",
  );

  return { showScope, scopeOptions, noPlace, campaign, isLoading, isError, scope, full, plan, ends, planned, steps: computed(() => forces.data.value?.steps ?? []), pins: computed(() => pins.data.value ?? []), planLine: computed(() => planLine.data.value ?? null), nothing, scopeEmpty, scopeEmptyText };
}
