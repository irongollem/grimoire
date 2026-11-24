import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { canonEntry } from "@/test/canonEntry";
import type { CanonEntry } from "@/types/canon.types";

const read = <T>(data: T) => ({ data: ref(data), isLoading: ref(false), isError: ref(false) });
const entries = read<CanonEntry[]>([]);
const forces = read({ steps: [] as unknown[], ticks: [] as unknown[], quests: [] as unknown[] });
const empty = () => read<unknown[]>([]);
const clues = empty();
const reads = { passages: empty(), party: empty(), links: empty(), arcs: empty(), quests: empty(), beatQuests: empty(), locations: empty(), sessions: empty() };
const facts = empty();

vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => entries }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => clues }));
vi.mock("@/composables/canon/useCanonForces", () => ({ useCanonForceData: () => forces }));
vi.mock("@/composables/canon/useCanonPassages", () => ({ useCanonPassages: () => reads.passages }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => reads.party }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => reads.links }));
vi.mock("@/composables/canon/useTableFacts", () => ({ useTableFacts: () => ({ facts }) }));
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => reads.arcs }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => reads.quests }));
vi.mock("@/composables/canon/useCampaignBeatQuests", () => ({ useCampaignBeatQuests: () => reads.beatQuests }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => reads.locations }));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({ useCampaignSessions: () => reads.sessions }));
const campaignState = { activeCampaign: { id: "c1", current_location_id: null as string | null } };
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaignState }));

import { useCanonUiStore } from "@/stores/ui/canon";
import { useTonight } from "./useTonight";

describe("useTonight", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useCanonUiStore().tonightScope = "all";
    entries.data.value = [];
    entries.isLoading.value = false;
    entries.isError.value = false;
  });

  // Bug caught: building the plan while a read is still missing, which shows "nothing waiting" for a canon that is loading.
  it("has no plan until every read has answered, and none after a failed read", () => {
    entries.isLoading.value = true;
    expect(useTonight().plan.value).toBeNull();
    entries.isLoading.value = false;
    entries.isError.value = true;
    const t = useTonight();
    expect(t.plan.value).toBeNull();
    expect(t.nothing.value).toBe(false);
  });

  // Bug caught: a force still moving being reported as an empty canon (nothing waiting) so the card and the page disagree.
  it("lists a force moving and is not empty because of it", () => {
    entries.data.value = [canonEntry({ id: "f1", part: "force", title: "The Guild" })];
    const t = useTonight();
    expect(t.plan.value?.forces.map((f) => f.title)).toEqual(["The Guild"]);
    expect(t.nothing.value).toBe(false);
  });

  // Bug caught: the scope control writing somewhere the page and the card do not both read.
  it("shares the scope through the Canon store", () => {
    const t = useTonight();
    t.scope.value = "quests";
    expect(useCanonUiStore().tonightScope).toBe("quests");
  });
});
