import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { systemOffers, type GameFeature, type GameSystemKey } from "@/systems/registry";
import PlayerPartyView from "./PlayerPartyView.vue";

const mocks = vi.hoisted(() => ({ system: "dnd5e-2024" }));

vi.mock("vue-router", () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ linkedPartyMemberId: "pm1" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: null }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({
  useGameSystem: () => ({ offers: (feature: string) => systemOffers(mocks.system as GameSystemKey, feature as GameFeature) }),
}));
vi.mock("@/composables/party/useActiveParty", () => ({
  useActiveParty: () => ({ data: ref([{ id: "pm1", name: "Brann" }]), isLoading: ref(false) }),
}));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useSharedNpcs: () => ({
    data: ref([{ id: "n1", name: "Mira", player_visible_to: ["pm1"] }]),
    isLoading: ref(false),
  }),
}));
vi.mock("@/composables/npcs/useNpcReveals", () => ({
  useMyNpcRevealMoments: () => ({ data: ref(new Map()), isLoading: ref(false) }),
}));
vi.mock("@/composables/player/useReadItems", () => ({
  useReadItems: () => ({ isNew: () => false, data: ref(new Map()), isError: ref(false) }),
  useMarkRead: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/player/useNewToYou", () => ({
  useNewToYou: (npcs: { value: unknown[] }) => ({
    ready: ref(true),
    entries: ref([]),
    ledger: npcs,
    turn: vi.fn(),
  }),
  toNewToYouItem: vi.fn(),
}));
vi.mock("@/composables/player/usePlayerPeople", () => ({
  usePlayerPeople: (npcs: { value: unknown[] }) => ({
    getRating: () => 0,
    place: () => null,
    places: ref([]),
    sortOptions: ref([]),
    effectiveSortBy: ref("name"),
    activeFilterCount: ref(0),
    groups: ref([]),
    groupsPending: ref(false),
    people: npcs,
  }),
}));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
  useAbove: () => ref(false),
}));

const stub = (name: string) => ({ name, template: `<div data-test="${name}" />` });
const stubs = {
  PeopleCompanyStrip: stub("PeopleCompanyStrip"),
  PeopleLedger: stub("PeopleLedger"),
  PeopleToolbar: stub("PeopleToolbar"),
  NewToYouStrip: stub("NewToYouStrip"),
  PeopleFilterSheet: stub("PeopleFilterSheet"),
  PartyMemberLightbox: stub("PartyMemberLightbox"),
  PlayerNpcLightbox: stub("PlayerNpcLightbox"),
  PlayerPartyCompanionLightbox: stub("PlayerPartyCompanionLightbox"),
  CompanionForm: stub("CompanionForm"),
  ImageLightbox: stub("ImageLightbox"),
};

function mountView() {
  return mount(PlayerPartyView, { global: { stubs } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  mocks.system = "dnd5e-2024";
});

describe("PlayerPartyView", () => {
  // #934: the People tab carries the neutral NPC ledger as well as the party, so a
  // Generic campaign keeps the ledger and loses only the company.
  it("keeps the company strip and the add-companion action in a system with a party", () => {
    const w = mountView();
    expect(w.find('[data-test="PeopleCompanyStrip"]').exists()).toBe(true);
    expect(w.text()).toContain("Add companion");
  });

  it("in a Generic campaign drops the company but keeps the NPC ledger", () => {
    mocks.system = "generic";
    const w = mountView();
    expect(w.find('[data-test="PeopleCompanyStrip"]').exists()).toBe(false);
    expect(w.text()).not.toContain("Add companion");
    expect(w.find('[data-test="PeopleLedger"]').exists()).toBe(true);
  });
});
