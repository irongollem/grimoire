import { mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import PartyView from "./PartyView.vue";
import { useLowArt } from "@/composables/useLowArt";

const state = vi.hoisted(() => ({ url: null as string | null }));

vi.mock("@/composables/party/useGroupPortrait", () => ({
  useGroupPortrait: () => ({
    groupPortraitUrl: computed(() => state.url),
    partyMembers: ref([{ id: "m1" }]),
    uploadGroupPortrait: vi.fn(),
    generating: ref(false),
    error: ref(""),
    groupPortraitCost: ref(1),
    groupPortraitByok: ref(false),
    generateGroupPortrait: vi.fn(),
  }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isAiEnabled: true }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ isDM: false }) }));

const mountView = () =>
  mount(PartyView, {
    global: {
      stubs: {
        PageHeader: { template: "<div><slot name='actions' /><slot /></div>" },
        PartyTracker: true,
        PartyMilestonesPanel: true,
        CharacterApprovalQueue: true,
        ManualHelpLink: true,
        GenerationCostBadge: true,
        AiImageBadge: true,
        AppButton: { props: ["label"], template: "<button>{{ label }}<slot /></button>" },
      },
    },
  });

describe("PartyView group portrait", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
    state.url = null;
  });

  // Bug: the group portrait is still drawn (and downloaded) in low art.
  it("replaces the group portrait with a Group portrait button in low art", () => {
    useLowArt().setLowArt(true);
    state.url = "/group.webp";
    const w = mountView();
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("Group portrait");
  });

  // Bug: low art leaves an empty "No group portrait yet" card above nothing.
  it("draws no group portrait section at all in low art when there is none", () => {
    useLowArt().setLowArt(true);
    const w = mountView();
    expect(w.text()).not.toContain("No group portrait yet");
  });

  it("draws the picture when low art is off", () => {
    state.url = "/group.webp";
    expect(mountView().find("img").attributes("src")).toBe("/group.webp");
  });
});
