import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PuzzleGeneratorPanel from "./PuzzleGeneratorPanel.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";

const mocks = vi.hoisted(() => ({
  createPuzzle: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));
// The free-plan puzzle_rooms quota — generation spends a credit, so this is
// checked before generating, separately from the AI-on/off toggle above.
const quotaState = vi.hoisted(() => ({ canCreate: true }));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ puzzleGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
  }),
}));
vi.mock("@/composables/dungeon-features/usePuzzles", () => ({
  useCreatePuzzle: () => ({ mutateAsync: mocks.createPuzzle }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ textMultiplierFor: () => 1 }) }));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: { get value() { return quotaState.canCreate; } }, quota: ref(null) }),
}));
vi.mock("@/ai/usePuzzleGeneration", () => ({
  usePuzzleGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    completedEntityId: ref(null),
    concept: ref(""),
    clearCompleted: vi.fn(),
    generate: mocks.generate,
  }),
}));

function mountPanel() {
  return mount(PuzzleGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, PaywallModal: true },
    },
  });
}

describe("PuzzleGeneratorPanel — AI gating (every plan, credits only)", () => {
  beforeEach(() => {
    mocks.createPuzzle.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    quotaState.canCreate = true;
  });

  it("shows a real Generate button (no paywall) when AI is on, regardless of plan", () => {
    const wrapper = mountPanel();

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(false);
    // No paywall modal exists anywhere in this flow now.
    expect(wrapper.html()).not.toContain("Pro feature");
  });

  it("shows AiOffNotice instead of a Generate button when the campaign's AI toggle is off", () => {
    campaignState.isAiEnabled = false;
    const wrapper = mountPanel();

    expect(wrapper.findComponent(AiOffNotice).exists()).toBe(true);
    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeFalsy();
  });
});

describe("PuzzleGeneratorPanel — quota gate (puzzle_rooms, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createPuzzle.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
  });

  it("keeps the Generate button visible and enabled-looking at the puzzle limit", async () => {
    quotaState.canCreate = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A flooded crypt.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    quotaState.canCreate = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A flooded crypt.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    quotaState.canCreate = true;
    mocks.generate.mockResolvedValue(null);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A flooded crypt.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
