import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestGeneratorPanel from "./QuestGeneratorPanel.vue";
import type { QuestHookResult } from "@/ai/types";

const mocks = vi.hoisted(() => ({
  createQuest: vi.fn(),
  createObjective: vi.fn(),
  createQuestRef: vi.fn(),
  createBeat: vi.fn(),
  createBeatEdge: vi.fn(),
  createConsequence: vi.fn(),
  push: vi.fn(),
  generate: vi.fn(),
}));

const isAiEnabled = ref(true);
// The free-plan quests quota — hook generation spends a credit, so this is
// checked before generating, separately from the AI-on/off toggle above.
const canCreateQuest = ref(true);

const hook: QuestHookResult = {
  title: "The Silent Bell",
  summary: "Something rings under the church at night.",
  objectives: [], // no spine, no objectives — not under test here (see useCreateQuestFromHook.test.ts)
  tags: [],
};

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ questGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
  }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useCreateQuest: () => ({ mutateAsync: mocks.createQuest }),
  useCreateObjective: () => ({ mutateAsync: mocks.createObjective }),
  useCreateQuestRef: () => ({ mutateAsync: mocks.createQuestRef }),
}));
// useCreateQuestFromHook (#822) calls straight through to these — mocked here
// rather than mocking useCreateQuestFromHook itself, so this test still
// exercises the real orchestration logic end to end.
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useCreateQuestBeat: () => ({ mutateAsync: mocks.createBeat }),
  useCreateQuestBeatEdge: () => ({ mutateAsync: mocks.createBeatEdge }),
  useCreateQuestConsequence: () => ({ mutateAsync: mocks.createConsequence }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 0 }) }));
const requireCredits = vi.fn(() => true);
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ textMultiplierFor: () => 1 }) }));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateQuest, quota: ref(null) }),
}));
const hooks = ref<QuestHookResult[]>([hook]);

vi.mock("@/ai/useQuestGeneration", () => ({
  useQuestGeneration: () => ({
    isGenerating: ref(false),
    error: ref(""),
    concept: ref(""),
    completedEntityId: ref(null),
    clearCompleted: vi.fn(),
    hooks,
    provenance: ref(undefined),
    generate: mocks.generate,
    clearHooks: vi.fn(),
  }),
}));

function mountPanel() {
  return mount(QuestGeneratorPanel, {
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        EntityCombobox: true,
        GeneratedEntityChips: true,
        GenerationCostBadge: true,
        PaywallModal: true,
      },
    },
  });
}

describe("QuestGeneratorPanel — createFromHook", () => {
  beforeEach(() => {
    mocks.createQuest.mockReset();
    mocks.createObjective.mockReset();
    mocks.createQuestRef.mockReset();
    mocks.createBeat.mockReset();
    mocks.createBeatEdge.mockReset();
    mocks.createConsequence.mockReset();
    mocks.push.mockReset();
    mocks.createQuest.mockResolvedValue({ id: "quest-new" });
    mocks.createObjective.mockResolvedValue({ id: "objective-new" });
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    hooks.value = [hook];
    requireCredits.mockReset().mockReturnValue(true);
  });

  // Regression guard for #799: `quests.rewards` and the currency/item reward
  // columns are dropped from the schema, so an insert that still lists them
  // fails at the database rather than merely being ignored.
  it("never sends the deleted reward columns when creating a quest from a generated hook", async () => {
    const wrapper = mountPanel();
    await wrapper.get('button[aria-label="Create Quest"]').trigger("click");
    await wrapper.vm.$nextTick();

    expect(mocks.createQuest).toHaveBeenCalledTimes(1);
    const insert = mocks.createQuest.mock.calls[0]![0] as Record<string, unknown>;
    for (const column of [
      "rewards", "reward_pp", "reward_gp", "reward_ep", "reward_sp", "reward_cp",
      "reward_item_ids", "reward_currency_pools",
    ]) {
      expect(insert).not.toHaveProperty(column);
    }
    expect(insert).toMatchObject({ title: "The Silent Bell", summary: hook.summary, status: "active" });
  });
});

// Every plan may generate as long as AI is on and the account can afford it —
// there is no Pro gate on generation itself (see ai-policy-spec.md).
describe("QuestGeneratorPanel — AI-on/off, every plan", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    hooks.value = [];
  });

  it("shows the real Generate Quest Hooks button once AI is on", () => {
    const wrapper = mountPanel();
    expect(wrapper.find('button[aria-label="Generate Quest Hooks"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("AI is off for this campaign");
  });

  it("shows AiOffNotice instead of a Generate button when AI is off", () => {
    isAiEnabled.value = false;
    const wrapper = mountPanel();
    expect(wrapper.find('button[aria-label="Generate Quest Hooks"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("AI is off for this campaign");
  });
});

// The free-plan quests quota (10) — hook generation spends credits, so it's
// checked before generating even though the AI toggle is on.
describe("QuestGeneratorPanel — quota gate (quests, checked before spending credits)", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    hooks.value = [];
    mocks.generate.mockReset();
    requireCredits.mockReset().mockReturnValue(true);
  });

  it("keeps the Generate Quest Hooks button visible and enabled-looking at the quest limit", () => {
    canCreateQuest.value = false;
    const wrapper = mountPanel();

    const button = wrapper.find('button[aria-label="Generate Quest Hooks"]');
    expect(button.exists()).toBe(true);
    expect(button.attributes("disabled")).toBeFalsy();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateQuest.value = false;
    const wrapper = mountPanel();

    await wrapper.get('button[aria-label="Generate Quest Hooks"]').trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });
});

// The button must stay clickable when the balance is short (never
// `disabled`) — clicking it is what opens the shared out-of-credits dialog
// via `requireCredits`, rather than the button disabling itself.
describe("QuestGeneratorPanel — credit gate (checked after the quota gate)", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    hooks.value = [];
    mocks.generate.mockReset();
    requireCredits.mockReset();
  });

  it("stays enabled-looking when the balance is short", () => {
    requireCredits.mockReturnValue(false);
    const wrapper = mountPanel();

    const button = wrapper.find('button[aria-label="Generate Quest Hooks"]');
    expect(button.exists()).toBe(true);
    expect(button.attributes("disabled")).toBeFalsy();
  });

  it("opens the out-of-credits dialog instead of generating when short on credits", async () => {
    requireCredits.mockReturnValue(false);
    const wrapper = mountPanel();

    await wrapper.get('button[aria-label="Generate Quest Hooks"]').trigger("click");

    expect(requireCredits).toHaveBeenCalledTimes(1);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it("generates once requireCredits allows it", async () => {
    requireCredits.mockReturnValue(true);
    const wrapper = mountPanel();

    await wrapper.get('button[aria-label="Generate Quest Hooks"]').trigger("click");

    expect(requireCredits).toHaveBeenCalledTimes(1);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});
