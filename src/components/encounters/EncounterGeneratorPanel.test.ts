import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EncounterGeneratorPanel from "./EncounterGeneratorPanel.vue";

const mocks = vi.hoisted(() => ({
  createEncounter: vi.fn(),
  generate: vi.fn(),
  push: vi.fn(),
}));

const isAiEnabled = ref(true);
// The free-plan encounters quota — generation spends a credit, so this must
// be checked before generating, not just at create. EncounterGeneratorPanel
// was the one generator panel missing this pre-check (only a post-create
// catch existed) before the useGenerationGate extraction.
const canCreateEncounter = ref(true);

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/stores/ui", () => ({ useUiStore: () => ({ encounterGeneratorOpen: true }) }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
  }),
}));
vi.mock("@/composables/encounters/useEncounters", () => ({
  useCreateEncounter: () => ({ mutateAsync: mocks.createEncounter }),
}));
vi.mock("@/composables/monsters/useMonsters", () => ({ useAllMonsters: () => ({ data: ref([]) }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/encounters/useCompanions", () => ({ useCompanions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => true, balance: ref(10) }),
}));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ textMultiplierFor: () => 1 }) }));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateEncounter, quota: ref(null) }),
}));
const requireCredits = vi.fn(() => true);
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits }) }));
vi.mock("@/ai/useEncounterGeneration", () => ({
  useEncounterGeneration: () => ({
    isGenerating: ref(false),
    error: ref(null),
    concept: ref(""),
    completedEntityId: ref(null),
    clearCompleted: vi.fn(),
    result: ref(null),
    generate: mocks.generate,
    clearResult: vi.fn(),
  }),
}));

function mountPanel() {
  return mount(EncounterGeneratorPanel, {
    global: {
      stubs: { RouterLink: RouterLinkStub, EntityCombobox: true, PaywallModal: true },
    },
  });
}

describe("EncounterGeneratorPanel — quota gate (encounters, checked before spending credits)", () => {
  beforeEach(() => {
    mocks.createEncounter.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    isAiEnabled.value = true;
    canCreateEncounter.value = true;
    requireCredits.mockReset().mockReturnValue(true);
  });

  it("keeps the Generate button visible and enabled-looking at the encounter limit", async () => {
    canCreateEncounter.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("Goblin ambush on the forest road.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"));
    expect(generateButton).toBeTruthy();
    expect(generateButton!.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of generating when clicked at the limit", async () => {
    canCreateEncounter.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("Goblin ambush on the forest road.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(requireCredits).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("generates normally when under the limit", async () => {
    canCreateEncounter.value = true;
    mocks.generate.mockResolvedValue(undefined);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("Goblin ambush on the forest road.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});

describe("EncounterGeneratorPanel — credit gate (short balance, under quota)", () => {
  beforeEach(() => {
    mocks.createEncounter.mockReset();
    mocks.generate.mockReset();
    mocks.push.mockReset();
    isAiEnabled.value = true;
    canCreateEncounter.value = true;
    requireCredits.mockReset();
  });

  it("opens the out-of-credits dialog instead of generating when the balance is short", async () => {
    requireCredits.mockReturnValue(false);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("Goblin ambush on the forest road.");

    const generateButton = wrapper.findAll("button").find((b) => b.text().includes("Generate with AI"))!;
    await generateButton.trigger("click");

    expect(mocks.generate).not.toHaveBeenCalled();
    expect(requireCredits).toHaveBeenCalledTimes(1);
  });
});
