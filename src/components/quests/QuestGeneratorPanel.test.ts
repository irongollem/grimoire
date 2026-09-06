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
  push: vi.fn(),
}));

const hook: QuestHookResult = {
  title: "The Silent Bell",
  summary: "Something rings under the church at night.",
  hook_description: "", // falsy — skips the opening-beat branch, not under test here
  objectives: [],
  tags: [],
};

vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ questGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    isAiEnabled: true,
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
vi.mock("@/composables/quests/useQuestFlow", () => ({ useCreateQuestBeat: () => ({ mutateAsync: mocks.createBeat }) }));
vi.mock("@/composables/billing/useSubscription", () => ({ useSubscription: () => ({ isPro: ref(true) }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 0, affordable: () => true }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ textMultiplierFor: () => 1 }) }));
vi.mock("@/ai/useQuestGeneration", () => ({
  useQuestGeneration: () => ({
    isGenerating: ref(false),
    error: ref(""),
    concept: ref(""),
    completedEntityId: ref(null),
    clearCompleted: vi.fn(),
    hooks: ref([hook]),
    provenance: ref(undefined),
    generate: vi.fn(),
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
        PaywallModal: true,
        GenerationCostBadge: true,
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
    mocks.push.mockReset();
    mocks.createQuest.mockResolvedValue({ id: "quest-new" });
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
