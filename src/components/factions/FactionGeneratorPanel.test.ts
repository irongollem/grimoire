import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FactionGeneratorPanel from "./FactionGeneratorPanel.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";

const mocks = vi.hoisted(() => ({
  createFaction: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));
// The free-plan factions quota — generation spends a credit, so this is
// checked before generating, separately from the AI-on/off toggle above.
const canCreateFaction = ref(true);

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ factionGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
  }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useCreateFaction: () => ({ mutateAsync: mocks.createFaction }),
  useAddFactionNpc: () => ({ mutateAsync: vi.fn() }),
  useAddFactionLocation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: ref([]) }) }));
vi.mock("@/ai/useFactionGeneration", () => ({
  useFactionGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    completedEntityId: ref(null),
    concept: ref(""),
    clearCompleted: vi.fn(),
    generate: mocks.generate,
  }),
}));
vi.mock("@/ai/useNpcGeneration", () => ({
  toTiptapJson: (text: string) => ({ type: "doc", content: [{ type: "text", text }] }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({ textMultiplierFor: () => 1 }),
}));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateFaction, quota: ref(null) }),
}));

function mountPanel() {
  return mount(FactionGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, PaywallModal: true },
    },
  });
}

describe("FactionGeneratorPanel — AI gating (every plan, credits only)", () => {
  beforeEach(() => {
    mocks.createFaction.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateFaction.value = true;
  });

  it("shows a real Generate button (no paywall) when AI is on, regardless of plan", () => {
    const wrapper = mountPanel();

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(false);
  });

  it("shows AiOffNotice instead of a Generate button when the campaign's AI toggle is off", () => {
    campaignState.isAiEnabled = false;
    const wrapper = mountPanel();

    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(true);
    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeFalsy();
  });
});

describe("FactionGeneratorPanel — quota gate (factions, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createFaction.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
  });

  it("keeps the Generate button visible and enabled-looking at the faction limit", async () => {
    canCreateFaction.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A shadowy thieves' guild.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });


  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateFaction.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A shadowy thieves' guild.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateFaction.value = true;
    mocks.generate.mockResolvedValue(null);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A shadowy thieves' guild.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
