import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NpcGeneratorPanel from "./NpcGeneratorPanel.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";

const mocks = vi.hoisted(() => ({
  createNpc: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));
// The free-plan npcs quota — generation spends a credit, so this is checked
// before generating, separately from the AI-on/off toggle above.
const canCreateNpc = ref(true);
// Whether the mocked account can afford the generation — false routes the
// click through requireCredits() into the out-of-credits dialog instead of
// calling generate().
const affordableState = vi.hoisted(() => ({ value: true }));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ npcGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai", image_provider: "openai" },
    decryptedApiKey: null,
    decryptedOpenAiKey: null,
    decryptedGeminiKey: null,
  }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useCreateNpc: () => ({ mutateAsync: mocks.createNpc, isPending: ref(false) }),
  useNpcs: () => ({ data: ref([]) }),
}));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: vi.fn() }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => affordableState.value, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({ textMultiplierFor: () => 1, imageMultiplierFor: () => 1 }),
  PORTRAIT_SIZE_BY_PROVIDER: { openai: "1024x1536", gemini: "1024x1536" },
}));
vi.mock("@/composables/locations/useLocations", () => ({ useLocationTree: () => ({ locationOptions: ref([]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: ref([]) }),
  useAddFactionNpc: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/factions/useNpcRelations", () => ({ useCreateNpcRelation: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/ai/useNpcGeneration", () => ({
  useNpcGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    concept: ref(""),
    completedEntityId: ref(null),
    clearCompleted: vi.fn(),
    generate: mocks.generate,
  }),
  toTiptapJson: (text: string) => ({ type: "doc", content: [{ type: "text", text }] }),
}));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateNpc, quota: ref(null) }),
}));

function mountPanel() {
  return mount(NpcGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, PaywallModal: true },
    },
  });
}

describe("NpcGeneratorPanel — AI gating (every plan, credits only)", () => {
  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateNpc.value = true;
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

describe("NpcGeneratorPanel — quota gate (npcs, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
  });

  it("keeps the Generate button visible and enabled-looking at the NPC limit", async () => {
    canCreateNpc.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateNpc.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateNpc.value = true;
    mocks.generate.mockResolvedValue(null);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});

describe("NpcGeneratorPanel — credit gate (short balance, under quota)", () => {
  beforeEach(() => {
    mocks.createNpc.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateNpc.value = true;
    affordableState.value = true;
    useOutOfCredits().closeOutOfCredits();
  });

  it("keeps the Generate button enabled when the balance is short", async () => {
    affordableState.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the out-of-credits dialog instead of generating when the balance is short", async () => {
    affordableState.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A mysterious tiefling bard.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(useOutOfCredits().needed.value).not.toBeNull();
  });
});
