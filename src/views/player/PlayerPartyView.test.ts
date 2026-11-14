import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { systemOffers, type GameFeature, type GameSystemKey } from "@/systems/registry";
import PlayerPartyView from "./PlayerPartyView.vue";

const mocks = vi.hoisted(() => ({
  system: "dnd5e-2024",
  lg: false,
  newToYou: [] as { npc: { id: string }; kind: string }[],
  inLedger: true,
}));

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
  useReadItems: () => ({ isNew: () => false, readAt: ref(new Map()), isError: ref(false) }),
  useMarkRead: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/player/useNewToYou", () => ({
  useNewToYou: (npcs: { value: unknown[] }) => ({
    ready: ref(true),
    entries: ref(mocks.newToYou),
    ledger: mocks.inLedger ? npcs : ref([]),
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
    people: mocks.inLedger ? npcs : ref([]),
  }),
}));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
  useAbove: () => ref(mocks.lg),
}));

const stub = (name: string) => ({ name, template: `<div data-test="${name}" />` });
const stubs = {
  PeopleCompanyStrip: { name: "PeopleCompanyStrip", props: ["canAdd"], emits: ["add"], template: '<div data-test="PeopleCompanyStrip" />' },
  PeopleLedger: stub("PeopleLedger"),
  PeopleToolbar: stub("PeopleToolbar"),
  NewToYouStrip: { name: "NewToYouStrip", emits: ["open", "turned"], template: '<div data-test="NewToYouStrip" />' },
  PeopleDetailPane: { name: "PeopleDetailPane", props: ["npc", "place"], template: '<aside data-test="PeopleDetailPane">{{ npc.name }}</aside>' },
  PeopleWaitingPane: { name: "PeopleWaitingPane", props: ["count"], template: '<aside data-test="PeopleWaitingPane">{{ count }}</aside>' },
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
  mocks.lg = false;
  mocks.newToYou = [];
  mocks.inLedger = true;
});

describe("PlayerPartyView", () => {
  // #934: the People tab carries the neutral NPC ledger as well as the party, so a
  // Generic campaign keeps the ledger and loses only the company.
  // Adding a companion lives on the company's own rubric now, not in a page header.
  it("keeps the company strip in a system with a party, and its add opens the companion form", async () => {
    const w = mountView();
    const strip = w.findComponent({ name: "PeopleCompanyStrip" });
    expect(strip.props("canAdd")).toBe(true);
    expect(w.find('[data-test="CompanionForm"]').exists()).toBe(false);
    strip.vm.$emit("add");
    await w.vm.$nextTick();
    expect(w.find('[data-test="CompanionForm"]').exists()).toBe(true);
  });

  it("in a Generic campaign drops the company but keeps the NPC ledger", () => {
    mocks.system = "generic";
    const w = mountView();
    expect(w.find('[data-test="PeopleCompanyStrip"]').exists()).toBe(false);
    expect(w.find('[data-test="PeopleLedger"]').exists()).toBe(true);
  });

  // From lg up there is no lightbox, only the pane beside the ledger. It used to
  // accept only ledger people, so opening a card in "New to you" showed nothing,
  // and with everyone still new the page sat in a 28rem column beside empty space.
  it("from lg up, a person opened from New to you shows in the pane while the ledger is empty", async () => {
    mocks.lg = true;
    mocks.inLedger = false;
    mocks.newToYou = [{ npc: { id: "n1" }, kind: "new" }];
    const w = mountView();
    expect(w.find('[data-test="PeopleDetailPane"]').exists()).toBe(false);
    w.findComponent({ name: "NewToYouStrip" }).vm.$emit("open", "n1");
    await w.vm.$nextTick();
    expect(w.find('[data-test="PeopleDetailPane"]').text()).toBe("Mira");
  });

  // The canvas "Player People", frame 03: the pane never disappears from lg up,
  // so the layout does not jump when the first card is turned.
  it("from lg up, with nobody selected, the waiting pane stands beside the ledger and counts who is waiting", () => {
    mocks.lg = true;
    mocks.inLedger = false;
    mocks.newToYou = [{ npc: { id: "n1" }, kind: "new" }];
    const w = mountView();
    expect(w.find('[data-test="PeopleWaitingPane"]').text()).toBe("1");
  });

  it("below lg there is no pane beside the ledger, waiting or otherwise", () => {
    const w = mountView();
    expect(w.find('[data-test="PeopleWaitingPane"]').exists()).toBe(false);
    expect(w.find('[data-test="PeopleDetailPane"]').exists()).toBe(false);
  });
});
