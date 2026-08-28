import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyTracker from "./PartyTracker.vue";
import type { PartyMember } from "@/types/party.types";

/** Just the fields PartyTracker's own template/sort reads — see the identical
 *  convention in `src/lib/dashboard/deathSaves.test.ts`. */
function partyMember(overrides: Partial<PartyMember> & { id: string }): PartyMember {
  return {
    name: overrides.id,
    sort_order: 0,
    current_initiative: null,
    class: null,
    level: 1,
    species_id: null,
    ...overrides,
  } as PartyMember;
}

const mocks = vi.hoisted(() => ({
  /** Mirrors what `useParty()` (a real TanStack useQuery result) hands back —
   *  undefined data is the disabled/in-flight case this bug was about. */
  partyData: undefined as PartyMember[] | undefined,
  partyIsError: false,
  refetch: vi.fn(),
}));

vi.mock("@/composables/party/useParty", () => ({
  // Real refs, not plain `{ value }` objects: PartyTracker's template reads
  // `party`/`isError` directly, relying on <script setup>'s automatic
  // ref-unwrapping — a non-ref mock renders truthy-object nonsense instead
  // (and fails the `PartyInventoryInline :party="..."` array prop check).
  useParty: () => ({
    data: ref(mocks.partyData),
    isError: ref(mocks.partyIsError),
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/encounters/useCompanions", () => ({
  useCompanions: () => ({ data: { value: [] } }),
  useDeleteCompanion: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/notes/usePlayerJournal", () => ({
  useDmAllSharedJournalEntries: () => ({ data: { value: [] } }),
}));
vi.mock("@/composables/rules/useSpecies", () => ({ useAllSpecies: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/party/useCharacterClasses", () => ({
  useAllCampaignCharacterClasses: () => ({ data: { value: [] } }),
}));
vi.mock("@/composables/monsters/useMonsters", () => ({ useAllMonsters: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/rules/useOptionalRules", () => ({ useIsRuleEnabled: () => ({ value: false }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn() }) }));

const globalStubs = {
  RouterLink: true,
  PartyTrackerRow: true,
  PartyXpAward: true,
  CompanionCard: true,
  CompanionForm: true,
  PartyInventoryInline: true,
};

describe("PartyTracker", () => {
  beforeEach(() => {
    mocks.partyData = undefined;
    mocks.partyIsError = false;
    mocks.refetch.mockReset();
  });

  it("shows the loading spinner, not the empty state, while the query has no answer yet (disabled or in-flight)", () => {
    mocks.partyData = undefined;
    mocks.partyIsError = false;
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(wrapper.text()).not.toContain("No heroes in your party");
    expect(wrapper.text()).not.toContain("could not be loaded");
    expect(wrapper.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
  });

  it("shows an error state with a working Retry control when the query fails", async () => {
    mocks.partyData = undefined;
    mocks.partyIsError = true;
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(wrapper.text()).not.toContain("No heroes in your party");
    expect(wrapper.text()).toContain("The party could not be loaded.");
    const retry = wrapper.findAll("button").find((b) => b.text() === "Retry");
    expect(retry).toBeTruthy();
    await retry!.trigger("click");
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state only once the query has actually succeeded with zero rows", () => {
    mocks.partyData = [];
    mocks.partyIsError = false;
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(wrapper.text()).toContain("No heroes in your party");
  });

  it("renders the party cards when the query succeeds with rows", () => {
    mocks.partyData = [partyMember({ id: "member-1", name: "Mira" })];
    mocks.partyIsError = false;
    const wrapper = mount(PartyTracker, { global: { stubs: globalStubs } });
    expect(wrapper.text()).not.toContain("No heroes in your party");
    expect(wrapper.text()).not.toContain("could not be loaded");
    expect(wrapper.findComponent({ name: "PartyTrackerRow" }).exists()).toBe(true);
  });
});
