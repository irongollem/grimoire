import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LocationGeneratorPanel from "./LocationGeneratorPanel.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";

const mocks = vi.hoisted(() => ({
  createLocation: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));
// The free-plan locations quota — generation spends a credit, so this is
// checked before generating, separately from the AI-on/off toggle above.
const canCreateLocation = ref(true);

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ locationGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
    decryptedOpenAiKey: null,
  }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useCreateLocation: () => ({ mutateAsync: mocks.createLocation }),
  useLocationTree: () => ({ locationOptions: ref([]) }),
}));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: vi.fn() }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)), info: vi.fn(), success: vi.fn() }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({ textMultiplierFor: () => 1, imageMultiplierFor: () => 1 }),
}));
vi.mock("@/ai/useLocationGeneration", () => ({
  useLocationGeneration: () => ({
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
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateLocation, quota: ref(null) }),
}));

function mountPanel() {
  return mount(LocationGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, PaywallModal: true },
    },
  });
}

describe("LocationGeneratorPanel — AI gating (every plan, credits only)", () => {
  beforeEach(() => {
    mocks.createLocation.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateLocation.value = true;
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

describe("LocationGeneratorPanel — quota gate (locations, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createLocation.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
  });

  it("keeps the Generate button visible and enabled-looking at the location limit", async () => {
    canCreateLocation.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A crumbling dwarven forge district.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateLocation.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A crumbling dwarven forge district.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateLocation.value = true;
    mocks.generate.mockResolvedValue(null);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A crumbling dwarven forge district.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
