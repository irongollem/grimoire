import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PuzzleGeneratorPanel from "./PuzzleGeneratorPanel.vue";
import AiOffNotice from "@/components/common/feedback/AiOffNotice.vue";

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
vi.mock("@/stores/ui/puzzles", () => ({ usePuzzlesUiStore: () => ({ puzzleGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
  }),
}));
vi.mock("@/composables/dungeon-features/usePuzzles", () => ({
  useCreatePuzzle: () => ({ mutateAsync: mocks.createPuzzle }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base), textIsByok: ref(false) }),
}));
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

describe("PuzzleGeneratorPanel — what a generation creates", () => {
  beforeEach(() => {
    mocks.createPuzzle.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    quotaState.canCreate = true;
  });

  const generated = {
    name: "Flooded Crypt", puzzle_type: "Logic", difficulty: "Hard", description: "d", hints: ["h1"], solution: "s",
    skill_checks: [], success_outcome: "ok", failure_consequence: "bad", notes: "n", tags: [], image_url: null,
  };

  async function run(concept: string) {
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue(concept);
    await wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!.trigger("click");
    await flushPromises();
  }

  it("sends the concept without surrounding whitespace", async () => {
    mocks.generate.mockResolvedValue(null);
    await run("   A flooded crypt.  ");
    expect(mocks.generate.mock.calls[0][0]).toBe("A flooded crypt.");
  });

  it("saves the puzzle private to the active campaign and opens it", async () => {
    mocks.generate.mockResolvedValue(generated);
    mocks.createPuzzle.mockResolvedValue({ id: "pz-1" });
    await run("A flooded crypt.");
    expect(mocks.createPuzzle.mock.calls[0][0]).toMatchObject({ name: "Flooded Crypt", campaign_id: "campaign-1", is_shared: false });
    expect(mocks.push).toHaveBeenCalledWith("/puzzles/pz-1");
  });

  it("creates and navigates nowhere when the generation returned nothing", async () => {
    mocks.generate.mockResolvedValue(null);
    await run("A flooded crypt.");
    expect(mocks.createPuzzle).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
