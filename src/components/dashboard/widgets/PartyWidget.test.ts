import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartyWidget from "./PartyWidget.vue";
import type { PartyMember } from "@/types/party.types";

/** Just the fields PartyWidget actually reads — see the identical convention
 *  in `src/lib/dashboard/deathSaves.test.ts`. */
function partyMember(overrides: Partial<PartyMember> & { id: string }): PartyMember {
  return {
    name: overrides.id,
    portrait_url: null,
    portrait_focal_point: null,
    current_hp: 10,
    max_hp: 10,
    ac: 15,
    wis: 10,
    proficiency_bonus: 2,
    skill_proficiencies: {},
    inspiration: false,
    conditions: [],
    curses: [],
    species_id: null,
    level: 1,
    class: null,
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

vi.mock("@/composables/useParty", () => ({
  // Real refs, not plain `{ value }` objects: PartyWidget's template reads
  // `party`/`partyIsError` directly, relying on <script setup>'s automatic
  // ref-unwrapping — a non-ref mock renders truthy-object nonsense instead.
  useParty: () => ({
    data: ref(mocks.partyData),
    isError: ref(mocks.partyIsError),
    refetch: mocks.refetch,
  }),
}));
vi.mock("@/composables/useSpecies", () => ({ useSpeciesNameMap: () => ({ value: new Map() }) }));
vi.mock("@/composables/useCharacterClasses", () => ({
  useAllCampaignCharacterClasses: () => ({ data: { value: [] } }),
}));
vi.mock("@/composables/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/useCampaignPresence", () => ({ useCampaignPresence: () => ({ isOnline: () => false }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: false }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: null }) }));

// AppButton renders a real RouterLink for every `to="..."` prop, which needs an
// injected router instance — stub it rather than standing up a router for a
// widget that never asserts on navigation.
const routerStub = { global: { stubs: { RouterLink: true } } };

describe("PartyWidget", () => {
  beforeEach(() => {
    mocks.partyData = undefined;
    mocks.partyIsError = false;
    mocks.refetch.mockReset();
  });

  it("shows the loading state, not the empty state, while the query has no answer yet (disabled or in-flight)", () => {
    mocks.partyData = undefined;
    mocks.partyIsError = false;
    const wrapper = mount(PartyWidget, routerStub);
    expect(wrapper.text()).not.toContain("No party members yet.");
    expect(wrapper.text()).not.toContain("could not be loaded");
    expect(wrapper.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
  });

  it("shows an error state with a working Retry control when the query fails", async () => {
    mocks.partyData = undefined;
    mocks.partyIsError = true;
    const wrapper = mount(PartyWidget, routerStub);
    expect(wrapper.text()).not.toContain("No party members yet.");
    expect(wrapper.text()).toContain("Party could not be loaded.");
    const retry = wrapper.findAll("button").find((b) => b.text() === "Retry");
    expect(retry).toBeTruthy();
    await retry!.trigger("click");
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("renders the empty state only once the query has actually succeeded with zero rows", () => {
    mocks.partyData = [];
    mocks.partyIsError = false;
    const wrapper = mount(PartyWidget, routerStub);
    expect(wrapper.text()).toContain("No party members yet.");
  });

  it("renders the party grid when the query succeeds with rows", () => {
    mocks.partyData = [partyMember({ id: "member-1", name: "Mira" })];
    mocks.partyIsError = false;
    const wrapper = mount(PartyWidget, {
      global: { stubs: { RouterLink: true, FocalImage: true, DmTrackerButtons: true } },
    });
    expect(wrapper.text()).not.toContain("No party members yet.");
    expect(wrapper.text()).toContain("Mira");
  });
});
