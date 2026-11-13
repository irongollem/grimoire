import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useLowArt } from "@/composables/useLowArt";
import PlayerNpcCard from "./PlayerNpcCard.vue";
import CharacterPoolCard from "./CharacterPoolCard.vue";
import EncounterCombatantList from "./EncounterCombatantList.vue";
import PeopleDetailPane from "./people/PeopleDetailPane.vue";
import PeopleLedgerRow from "./people/PeopleLedgerRow.vue";
import PeopleCompanyStrip from "./people/PeopleCompanyStrip.vue";
import NewToYouCard from "./people/NewToYouCard.vue";
import type { PlayerNpc } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import type { RunCombatant } from "@/types/encounter.types";

/*
  Low art on the player portal (#1179): a record's picture is neither drawn nor
  fetched, so no <img> of it reaches the page and the name still leads. Each
  surface is mounted with the real FocalImage, because a stubbed one could not
  show a picture that slipped through.
*/
vi.mock("@/composables/memorials/useMemorials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/memorials/useMemorials")>()),
  useWallMemorials: () => ({ data: { value: { memorials: [] } } }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({}) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({}) }));
vi.mock("@/composables/party/useCharacterPool", () => ({
  useAttachCharacter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDetachCharacter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCloneCharacter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePoolCharacter: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/composables/party/useCharacterContentReviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/party/useCharacterContentReviews")>()),
  useCharacterContentReviews: () => ({ refetch: vi.fn() }),
}));

const PassThrough = defineComponent({ template: "<div><slot /></div>" });
const { setLowArt } = useLowArt();
afterEach(() => {
  setLowArt(false);
});

function queryPlugin(): [typeof VueQueryPlugin, { queryClient: QueryClient }] {
  return [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }];
}

const npc = {
  id: "n1",
  name: "Mira Thorne",
  status: "alive",
  relationship: "friendly",
  race: "Human",
  occupation: "Apothecary",
  portrait_url: "https://cdn.test/mira.webp",
  disguise_name: null,
  disguise_portrait_url: null,
  is_revealed: false,
  player_visible_fields: ["name", "portrait", "race", "occupation"],
} as unknown as PlayerNpc;

describe("player NPC surfaces in low art", () => {
  function mountCard() {
    return mount(PlayerNpcCard, {
      props: { npc },
      global: { plugins: [queryPlugin()], stubs: { MiniPortraitOverlay: PassThrough, NpcRatingStars: true } },
    });
  }

  it("draws the portrait normally (the control for the guards below)", () => {
    expect(mountCard().find("img").exists()).toBe(true);
  });

  it("the NPC card still downloads the portrait in low art, and loses the relationship chip with it", () => {
    setLowArt(true);
    const wrapper = mountCard();
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Mira Thorne");
    expect(wrapper.text()).toContain("friendly");
  });

  it("keeps the 3D mini reachable in low art, where the portrait block that wrapped it is gone", () => {
    setLowArt(true);
    const wrapper = mount(PlayerNpcCard, {
      props: { npc },
      global: { plugins: [queryPlugin()], stubs: { NpcRatingStars: true } },
    });
    const overlay = wrapper.findComponent({ name: "MiniPortraitOverlay" });
    expect(overlay.exists()).toBe(true);
    expect(overlay.props("source")).toEqual({ table: "npcs", id: "n1" });
  });

  it("the people ledger row still holds a portrait tile in low art", () => {
    setLowArt(true);
    const wrapper = mount(PeopleLedgerRow, { props: { npc } });
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Mira Thorne");
  });

  it("the person pane keeps its portrait plate in low art and offers the portrait on request", () => {
    setLowArt(true);
    const wrapper = mount(PeopleDetailPane, {
      props: { npc },
      global: { stubs: { PlayerNpcProfile: { template: "<div><slot name='plate' /></div>" } } },
    });
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.findAll("button").some((b) => b.text() === "Portrait")).toBe(true);
  });

  it("the New to you card shows the face of an unmasked person in low art", () => {
    setLowArt(true);
    const wrapper = mount(NewToYouCard, {
      props: {
        kind: "unmasked",
        person: { name: "Mira Thorne", what: null, portraitUrl: "https://cdn.test/mira.webp", focalPoint: null, relationship: "friendly" },
        cover: { name: "Old Tam", portraitUrl: "https://cdn.test/tam.webp", focalPoint: null },
      },
    });
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Mira Thorne");
    expect(wrapper.text()).toContain("Old Tam");
  });
});

describe("player party surfaces in low art", () => {
  const member = {
    id: "m1",
    name: "Brix",
    class: "Fighter",
    level: 3,
    ruleset: "2024",
    portrait_url: "https://cdn.test/brix.webp",
  } as unknown as PartyMember;

  it("the company strip still draws the group portrait and member portraits in low art", () => {
    setLowArt(true);
    const wrapper = mount(PeopleCompanyStrip, {
      props: {
        entries: [{ kind: "member", data: member }],
        groupPortraitUrl: "https://cdn.test/group.webp",
        viewerMemberId: null,
        showHp: () => false,
      },
      global: { plugins: [queryPlugin()], stubs: { HearthSection: PassThrough } },
    });
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("The party");
    expect(wrapper.text()).toContain("Brix");
  });

  it("the pool card shows the portrait instead of the initial in low art", () => {
    setLowArt(true);
    const wrapper = mount(CharacterPoolCard, {
      props: { character: member, attachedCampaign: null, availableCampaigns: [], waitingCount: 0 },
      global: { stubs: { RulesetBounceDialog: true } },
    });
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("Brix");
    expect(wrapper.text()).toContain("B");
  });

  it("the encounter list still reserves a portrait column in low art", () => {
    setLowArt(true);
    const combatant = {
      instance_id: "i1",
      name: "Goblin",
      type: "monster",
      initiative: 12,
      image_url: "https://cdn.test/gob.webp",
      conditions: [],
    } as unknown as RunCombatant;
    const wrapper = mount(EncounterCombatantList, {
      props: {
        visibleCombatants: [combatant],
        activeInstanceId: null,
        isInLobby: false,
        healthVis: "strategic",
        partyMap: new Map(),
      },
      global: { plugins: [queryPlugin()] },
    });
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find(".portrait-cell").exists()).toBe(false);
    expect(wrapper.text()).toContain("Goblin");
  });
});
