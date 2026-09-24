import { ref } from "vue";
import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestDesignerPanel from "./QuestDesignerPanel.vue";
import type { QuestDesignTree, QuestDesignQuestion } from "@/lib/quests/designer";

const mocks = vi.hoisted(() => ({
  propose: vi.fn(),
  answer: vi.fn(),
  reset: vi.fn(),
  createFromHook: vi.fn(),
  push: vi.fn(),
  confirm: vi.fn(),
  toastInfo: vi.fn(),
}));

// Shared reactive state behind the mocked composable — mutated per test
// rather than re-mocked, since useQuestDesigner (S2, #873) is the module-
// level-singleton shape the rest of src/ai/use*Generation.ts already uses.
const designerState = {
  prose: ref(""),
  tree: ref<QuestDesignTree | null>(null),
  previousTree: ref<QuestDesignTree | null>(null),
  questions: ref<QuestDesignQuestion[]>([]),
  turn: ref(0),
  turnsLeft: ref(10),
  note: ref(""),
  provenance: ref(null),
  isGenerating: ref(false),
  error: ref(""),
};

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
const isAiEnabled = ref(true);
// The free-plan quests quota — each propose/answer turn spends a credit, so
// this is checked before every turn, separately from the AI-on/off toggle.
const canCreateQuest = ref(true);

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
    activeCampaign: { text_provider: "openai" },
    decryptedApiKey: null,
  }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useCreateQuestFromHook", () => ({
  useCreateQuestFromHook: () => ({ createFromHook: mocks.createFromHook }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1 }) }));
const requireCredits = vi.fn(() => true);
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits }) }));
vi.mock("@/composables/ai/useProviderConfig", () => ({ useProviderConfig: () => ({ textMultiplierFor: () => 1 }) }));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateQuest, quota: ref(null) }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ info: mocks.toastInfo, success: vi.fn(), error: vi.fn() }),
}));
vi.mock("@/ai/useQuestDesigner", () => ({
  useQuestDesigner: () => ({
    ...designerState,
    propose: mocks.propose,
    answer: mocks.answer,
    reset: mocks.reset,
  }),
}));

function mountPanel(props: { parentId?: string | null } = {}) {
  return mount(QuestDesignerPanel, {
    props,
    global: {
      stubs: {
        GenerationCostBadge: true,
        GeneratedEntityChips: true,
        RouterLink: RouterLinkStub,
        PaywallModal: true,
      },
    },
  });
}

describe("QuestDesignerPanel", () => {
  beforeEach(() => {
    mocks.propose.mockReset();
    mocks.answer.mockReset();
    mocks.reset.mockReset();
    mocks.createFromHook.mockReset();
    mocks.push.mockReset();
    mocks.confirm.mockReset().mockResolvedValue(true);
    mocks.toastInfo.mockReset();
    designerState.prose.value = "";
    designerState.tree.value = null;
    designerState.previousTree.value = null;
    designerState.questions.value = [];
    designerState.turn.value = 0;
    designerState.turnsLeft.value = 10;
    designerState.note.value = "";
    designerState.isGenerating.value = false;
    designerState.error.value = "";
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    requireCredits.mockReset().mockReturnValue(true);
  });

  it("disables Propose a tree while the prose is empty", () => {
    const wrapper = mountPanel();
    expect(wrapper.get('button[aria-label="Propose a tree"]').attributes("disabled")).toBeDefined();
  });

  it("calls propose() once the DM has written something and clicks Propose a tree", async () => {
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A dragon cult under the old mill.");
    expect(wrapper.get('button[aria-label="Propose a tree"]').attributes("disabled")).toBeUndefined();

    await wrapper.get('button[aria-label="Propose a tree"]').trigger("click");
    expect(mocks.propose).toHaveBeenCalledTimes(1);
  });

  it("renders one question card per open question after turn 1", () => {
    designerState.turn.value = 1;
    designerState.questions.value = [
      { key: "q1", about: "b1", question: "Does the guard survive?", why: "It forks the next beat.", options: [{ key: "a", label: "Yes" }, { key: "b", label: "No" }] },
      { key: "q2", about: null, question: "What tone should the ending take?", why: "It shapes the finale beat.", options: [{ key: "a", label: "Grim" }, { key: "b", label: "Playful" }] },
    ];
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Does the guard survive?");
    expect(wrapper.text()).toContain("What tone should the ending take?");
  });

  it("builds the answer via toDesignAnswer and sends it on Send answers", async () => {
    designerState.turn.value = 1;
    designerState.questions.value = [
      { key: "q1", about: null, question: "Does the guard survive?", why: "It forks the next beat.", options: [{ key: "a", label: "Yes" }, { key: "b", label: "No" }] },
    ];
    const wrapper = mountPanel();

    await wrapper.get('button[aria-label="Yes"]').trigger("click");
    await wrapper.get('button[aria-label="Send answers"]').trigger("click");

    expect(mocks.answer).toHaveBeenCalledTimes(1);
    expect(mocks.answer).toHaveBeenCalledWith([
      { question_key: "q1", question: "Does the guard survive?", answer: "Yes" },
    ]);
  });

  it("calls createFromHook with the settled tree and navigates to the new quest's overview", async () => {
    designerState.turn.value = 1;
    designerState.tree.value = {
      title: "The Silent Crypt",
      summary: "Something stirs beneath the old chapel.",
      beats: [],
      routes: [],
      objectives: [],
      tags: [],
    };
    mocks.createFromHook.mockResolvedValue({ questId: "quest-new", beatsCreated: 2 });
    const wrapper = mountPanel({ parentId: "parent-1" });

    await wrapper.get('button[aria-label="Create quest"]').trigger("click");
    await flushPromises();

    expect(mocks.createFromHook).toHaveBeenCalledWith(
      expect.objectContaining({ hook: designerState.tree.value, parentQuestId: "parent-1" }),
    );
    expect(mocks.push).toHaveBeenCalledWith({ path: "/quests/quest-new", query: { view: "overview" } });
  });

  it("tells the DM when the created quest has no story beats yet", async () => {
    designerState.turn.value = 1;
    designerState.tree.value = {
      title: "The Silent Crypt",
      summary: "Something stirs beneath the old chapel.",
      beats: [],
      routes: [],
      objectives: [],
      tags: [],
    };
    mocks.createFromHook.mockResolvedValue({ questId: "quest-new", beatsCreated: 0 });
    const wrapper = mountPanel();

    await wrapper.get('button[aria-label="Create quest"]').trigger("click");
    await flushPromises();

    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
  });

  it("disables Send answers once the turn budget is exhausted", () => {
    designerState.turn.value = 10;
    designerState.turnsLeft.value = 0;
    designerState.questions.value = [
      { key: "q1", about: null, question: "Does the guard survive?", why: "It forks the next beat.", options: [{ key: "a", label: "Yes" }] },
    ];
    const wrapper = mountPanel();
    expect(wrapper.get('button[aria-label="Send answers"]').attributes("disabled")).toBeDefined();
  });

  // Every plan may design a quest as long as AI is on and the account can
  // afford it — there is no Pro gate on generation itself (see ai-policy-spec.md).
  it("shows the real Propose a tree button once AI is on", () => {
    const wrapper = mountPanel();
    expect(wrapper.find('button[aria-label="Propose a tree"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("AI is off for this campaign");
  });

  it("shows AiOffNotice instead of the designer when AI is off, on any plan", () => {
    isAiEnabled.value = false;
    const wrapper = mountPanel();
    expect(wrapper.find('button[aria-label="Propose a tree"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("AI is off for this campaign");
  });
});

// The free-plan quests quota (10) — each propose/answer turn spends a
// credit, so it's checked before every turn even though the AI toggle is on.
describe("QuestDesignerPanel — quota gate (quests, checked before spending credits)", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    mocks.propose.mockReset();
    mocks.answer.mockReset();
    designerState.prose.value = "";
    designerState.turn.value = 0;
    designerState.questions.value = [];
    designerState.isGenerating.value = false;
    requireCredits.mockReset().mockReturnValue(true);
  });

  it("keeps Propose a tree visible and enabled-looking at the quest limit", async () => {
    canCreateQuest.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A dragon cult under the old mill.");

    const button = wrapper.get('button[aria-label="Propose a tree"]');
    expect(button.attributes("disabled")).toBeUndefined();
  });

  it("opens the quota paywall instead of proposing when clicked at the limit", async () => {
    canCreateQuest.value = false;
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A dragon cult under the old mill.");

    await wrapper.get('button[aria-label="Propose a tree"]').trigger("click");

    expect(mocks.propose).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });

  it("opens the quota paywall instead of sending answers when clicked at the limit", async () => {
    designerState.turn.value = 1;
    designerState.questions.value = [
      { key: "q1", about: null, question: "Does the guard survive?", why: "It forks the next beat.", options: [{ key: "a", label: "Yes" }] },
    ];
    canCreateQuest.value = false;
    const wrapper = mountPanel();

    await wrapper.get('button[aria-label="Yes"]').trigger("click");
    await wrapper.get('button[aria-label="Send answers"]').trigger("click");

    expect(mocks.answer).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
  });
});

// Neither button disables itself for a short balance (never `!affordable`) —
// clicking is what opens the shared out-of-credits dialog via
// `requireCredits`, checked after the quota gate for both Propose and Send.
describe("QuestDesignerPanel — credit gate (checked after the quota gate)", () => {
  beforeEach(() => {
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    mocks.propose.mockReset();
    mocks.answer.mockReset();
    designerState.prose.value = "";
    designerState.turn.value = 0;
    designerState.questions.value = [];
    designerState.isGenerating.value = false;
    requireCredits.mockReset();
  });

  it("keeps Propose a tree enabled-looking when short on credits", async () => {
    requireCredits.mockReturnValue(false);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A dragon cult under the old mill.");

    expect(wrapper.get('button[aria-label="Propose a tree"]').attributes("disabled")).toBeUndefined();
  });

  it("opens the out-of-credits dialog instead of proposing when short on credits", async () => {
    requireCredits.mockReturnValue(false);
    const wrapper = mountPanel();
    await wrapper.get("textarea").setValue("A dragon cult under the old mill.");

    await wrapper.get('button[aria-label="Propose a tree"]').trigger("click");

    expect(requireCredits).toHaveBeenCalledTimes(1);
    expect(mocks.propose).not.toHaveBeenCalled();
  });

  it("opens the out-of-credits dialog instead of sending answers when short on credits", async () => {
    designerState.turn.value = 1;
    designerState.questions.value = [
      { key: "q1", about: null, question: "Does the guard survive?", why: "It forks the next beat.", options: [{ key: "a", label: "Yes" }] },
    ];
    requireCredits.mockReturnValue(false);
    const wrapper = mountPanel();

    await wrapper.get('button[aria-label="Yes"]').trigger("click");
    await wrapper.get('button[aria-label="Send answers"]').trigger("click");

    expect(requireCredits).toHaveBeenCalledTimes(1);
    expect(mocks.answer).not.toHaveBeenCalled();
  });
});
