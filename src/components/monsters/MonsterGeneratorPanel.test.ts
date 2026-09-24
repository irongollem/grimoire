import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MonsterGeneratorPanel from "./MonsterGeneratorPanel.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";

const mocks = vi.hoisted(() => ({
  generateAndCreateMonster: vi.fn(),
  push: vi.fn(),
}));

// The campaign's AI toggle, mutable per test (#thisspec: "AI for every plan
// with credits" — the generate control is gated on this and on affordability,
// never on plan).
const campaignState = vi.hoisted(() => ({ isAiEnabled: true }));
// The free-plan monsters quota — generation spends a credit, so this is
// checked before generating, separately from the AI-on/off toggle above.
const canCreateMonster = ref(true);
// Whether the mocked account can afford the generation — false routes the
// click through requireCredits() into the out-of-credits dialog instead of
// calling generateAndCreateMonster().
const affordableState = vi.hoisted(() => ({ value: true }));

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ monsterGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return campaignState.isAiEnabled; },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
  }),
}));
vi.mock("@/composables/monsters/useGenerateMonster", () => ({
  useGenerateMonster: () => ({ generateAndCreateMonster: mocks.generateAndCreateMonster }),
}));
vi.mock("@/ai/useMonsterGeneration", () => ({
  useMonsterGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    completedEntityId: ref(null),
    concept: ref(""),
    clearCompleted: vi.fn(),
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ affordable: () => affordableState.value, balance: ref(10) }),
}));
vi.mock("@/composables/monsters/useMonsterGenerationCost", () => ({
  useMonsterGenerationCost: () => ({ credits: ref(1) }),
}));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateMonster, quota: ref(null) }),
}));

function mountPanel() {
  return mount(MonsterGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, PaywallModal: true },
    },
  });
}

describe("MonsterGeneratorPanel — AI gating (every plan, credits only)", () => {
  beforeEach(() => {
    mocks.generateAndCreateMonster.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateMonster.value = true;
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

describe("MonsterGeneratorPanel — quota gate (monsters, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.generateAndCreateMonster.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
  });

  it("keeps the Generate button visible and enabled-looking at the monster limit", async () => {
    canCreateMonster.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A colossal spider deity.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateMonster.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A colossal spider deity.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generateAndCreateMonster).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateMonster.value = true;
    mocks.generateAndCreateMonster.mockResolvedValue({ id: null, error: null });
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A colossal spider deity.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generateAndCreateMonster).toHaveBeenCalledTimes(1);
  });
});

describe("MonsterGeneratorPanel — credit gate (short balance, under quota)", () => {
  beforeEach(() => {
    mocks.generateAndCreateMonster.mockReset();
    mocks.push.mockReset();
    campaignState.isAiEnabled = true;
    canCreateMonster.value = true;
    affordableState.value = true;
    useOutOfCredits().closeOutOfCredits();
  });

  it("keeps the Generate button enabled when the balance is short", async () => {
    affordableState.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A colossal spider deity.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the out-of-credits dialog instead of generating when the balance is short", async () => {
    affordableState.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A colossal spider deity.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generateAndCreateMonster).not.toHaveBeenCalled();
    expect(useOutOfCredits().needed.value).not.toBeNull();
  });
});
