import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TrapGeneratorPanel from "./TrapGeneratorPanel.vue";

const mocks = vi.hoisted(() => ({
  createTrap: vi.fn(),
  logImageGeneration: vi.fn(),
  push: vi.fn(),
  isAiEnabled: true,
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ trapGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return mocks.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
    decryptedOpenAiKey: null,
  }),
}));
vi.mock("@/composables/dungeon-features/useTraps", () => ({
  useCreateTrap: () => ({ mutateAsync: mocks.createTrap }),
}));
vi.mock("@/composables/ai/useImageGenerationLog", () => ({
  useImageGenerationLog: () => ({ logImageGeneration: mocks.logImageGeneration }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useProviderConfig", () => ({
  useProviderConfig: () => ({ textMultiplierFor: () => 1, imageMultiplierFor: () => 1 }),
}));
vi.mock("@/ai/useTrapGeneration", () => ({
  useTrapGeneration: () => ({
    isGenerating: ref(false),
    error: ref(""),
    concept: ref(""),
    completedEntityId: ref(null),
    clearCompleted: vi.fn(),
    generate: vi.fn(),
  }),
}));

function mountPanel() {
  return mount(TrapGeneratorPanel, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
      },
    },
  });
}

describe("TrapGeneratorPanel — AI availability", () => {
  beforeEach(() => {
    mocks.createTrap.mockReset();
    mocks.logImageGeneration.mockReset();
    mocks.push.mockReset();
    mocks.isAiEnabled = true;
  });

  it("shows a real Generate button — every plan may generate as long as AI is on", () => {
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain("Generate with AI");
    expect(wrapper.text()).not.toContain("AI is off for this campaign");
    expect(wrapper.text()).toContain("New Blank Trap");
  });

  it("shows AiOffNotice instead of a Generate button when the campaign's AI toggle is off", () => {
    mocks.isAiEnabled = false;
    const wrapper = mountPanel();

    expect(wrapper.text()).toContain("AI is off for this campaign");
    expect(wrapper.text()).toContain("Turn it on");
    // No generate control at all — not even a disabled/paywall one.
    const buttons = wrapper.findAll("button, a").map((b) => b.text());
    expect(buttons.some((t) => t.includes("Generate with AI"))).toBe(false);
  });
});
