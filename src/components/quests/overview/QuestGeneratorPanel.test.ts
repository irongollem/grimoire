import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestGeneratorPanel from "./QuestGeneratorPanel.vue";
import type { QuestHookResult } from "@/ai/types";

const mocks = vi.hoisted(() => ({
  createQuest: vi.fn(),
  createObjective: vi.fn(),
  createQuestRefs: vi.fn(),
  createBeat: vi.fn(),
  createBeatEdge: vi.fn(),
  createConsequence: vi.fn(),
  push: vi.fn(),
  generate: vi.fn(),
  toastInfo: vi.fn(),
  ui: { questGeneratorOpen: true },
  party: [] as Array<{ level: number }>,
  npcs: [] as Array<{ id: string; name: string; occupation: string | null; relationship: string | null }>,
  places: [] as Array<{ id: string; name: string }>,
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
vi.mock("@/stores/ui/quests", () => ({ useQuestsUiStore: () => mocks.ui }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() {
      return isAiEnabled.value;
    },
    activeCampaignId: "campaign-1",
    activeCampaign: { text_provider: "openai" },
  }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([]) }) }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: ref(mocks.party) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref(mocks.npcs) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref(mocks.places) }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([]) }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useCreateQuest: () => ({ mutateAsync: mocks.createQuest }),
  useCreateQuestRefs: () => ({ mutateAsync: mocks.createQuestRefs }),
}));
// useCreateQuestFromHook (#822) calls straight through to these — mocked here
// rather than mocking useCreateQuestFromHook itself, so this test still
// exercises the real orchestration logic end to end: the spine's batch writes
// run through the real `writeQuestSpine`, fanned out to per-row recorders.
vi.mock("@/composables/quests/useQuestSpineWriter", async () => {
  const { writeQuestSpine } = await import("@/lib/quests/spineWrite");
  return {
    useQuestSpineWriter: () => ({
      writeSpine: (input: Parameters<typeof writeQuestSpine>[0]) =>
        writeQuestSpine(input, {
          createBeats: async (rows) => Promise.all(rows.map((row) => mocks.createBeat(row))),
          createBeatEdges: async (rows) => { for (const row of rows) await mocks.createBeatEdge(row); },
          createObjectives: async (rows) => Promise.all(rows.map((row) => mocks.createObjective(row))),
          createConsequences: async (rows) => { for (const row of rows) await mocks.createConsequence(row); },
        }),
    }),
  };
});
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 0 }) }));
const requireCredits = vi.fn(() => true);
vi.mock("@/composables/ai/useOutOfCredits", () => ({ useOutOfCredits: () => ({ requireCredits }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ textMultiplier: ref(1), textCredits: (base: number) => Math.ceil(base), textIsByok: ref(false) }),
}));
vi.mock("@/composables/billing/useQuota", () => ({
  useQuota: () => ({ canCreate: canCreateQuest, quota: ref(null) }),
}));
const hooks = ref<QuestHookResult[]>([hook]);
const concept = ref("");
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ info: mocks.toastInfo, error: vi.fn(), success: vi.fn() }) }));

vi.mock("@/ai/useQuestGeneration", () => ({
  useQuestGeneration: () => ({
    isGenerating: ref(false),
    error: ref(""),
    concept,
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
    mocks.createQuestRefs.mockReset();
    mocks.createBeat.mockReset();
    mocks.createBeatEdge.mockReset();
    mocks.createConsequence.mockReset();
    mocks.push.mockReset();
    mocks.createQuest.mockResolvedValue({ id: "quest-new" });
    mocks.createObjective.mockImplementation(async (objective: { sort_order: number }) => ({ id: "objective-new", ...objective }));
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    hooks.value = [hook];
    mocks.ui.questGeneratorOpen = true;
    mocks.party = [];
    mocks.npcs = [];
    mocks.places = [];
    mocks.toastInfo.mockReset();
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

describe("QuestGeneratorPanel — the request and the created quest", () => {
  beforeEach(() => {
    mocks.generate.mockReset();
    mocks.createQuest.mockReset().mockResolvedValue({ id: "quest-new" });
    mocks.createObjective.mockReset();
    mocks.createBeat.mockReset();
    mocks.createBeatEdge.mockReset();
    mocks.createConsequence.mockReset();
    mocks.push.mockReset();
    mocks.toastInfo.mockReset();
    mocks.ui.questGeneratorOpen = true;
    mocks.party = [];
    mocks.npcs = [{ id: "npc-1", name: "Mara", occupation: "Smith", relationship: "ally" }, { id: "npc-2", name: "Odo", occupation: null, relationship: null }];
    mocks.places = [{ id: "loc-1", name: "Thornkeep" }];
    isAiEnabled.value = true;
    canCreateQuest.value = true;
    hooks.value = [];
    concept.value = "";
    requireCredits.mockReset().mockReturnValue(true);
  });
  const generate = async (w: ReturnType<typeof mountPanel>) => {
    await w.get('button[aria-label="Generate Quest Hooks"]').trigger("click");
    await flushPromises();
  };
  const pick = (w: ReturnType<typeof mountPanel>, placeholder: string, id: string) =>
    w.findAllComponents({ name: "EntityCombobox" }).find((c) => c.attributes("placeholder") === placeholder)!.vm.$emit("update:modelValue", id);
  const sentPrompt = () => mocks.generate.mock.calls.at(-1)![0] as string;

  it("tells the model the party's level, rounding the average up, and says 1 for a party it does not know", async () => {
    mocks.party = [{ level: 3 }, { level: 4 }];
    const w = mountPanel();
    expect(w.text()).toContain("4 (avg of 2 members)");
    await generate(w);
    expect(sentPrompt()).toContain("Party level: 4");
    mocks.party = [{ level: 5 }];
    expect(mountPanel().text()).toContain("5 (avg of 1 member)");
    mocks.party = [];
    const empty = mountPanel();
    expect(empty.text()).toContain("PARTY LEVEL");
    await generate(empty);
    expect(sentPrompt()).toContain("Party level: 1");
  });

  it("builds the constraints from the chosen giver and place, and from nothing when none is chosen", async () => {
    const w = mountPanel();
    await generate(w);
    expect(sentPrompt()).not.toContain("Quest Giver");
    expect(sentPrompt()).not.toContain("constraints");

    pick(w, "Search NPCs…", "npc-1");
    pick(w, "Search locations…", "loc-1");
    await w.vm.$nextTick();
    await generate(w);
    expect(sentPrompt()).toContain("Quest Giver: Mara (Smith, ally)");
    expect(sentPrompt()).toContain("Location: Thornkeep");

    pick(w, "Search NPCs…", "npc-2");
    await w.vm.$nextTick();
    await generate(w);
    expect(sentPrompt()).toContain("Quest Giver: Odo");
    expect(sentPrompt()).not.toContain("Quest Giver: Odo (");
  });

  it("adds the theme trimmed, and names the request by it, else by the party's level", async () => {
    mocks.party = [{ level: 3 }];
    const w = mountPanel();
    await generate(w);
    expect(sentPrompt()).not.toContain("Theme");
    expect(concept.value).toBe("Level 3 quest hooks");
    await w.get("textarea").setValue("  A cult under the mill  ");
    await generate(w);
    expect(sentPrompt()).toContain("Theme: A cult under the mill");
    expect(concept.value).toBe("A cult under the mill");
  });

  it("creating a quest from a hook uses the chosen giver and place, then offers View and Build flow", async () => {
    const w = mountPanel();
    pick(w, "Search NPCs…", "npc-1");
    pick(w, "Search locations…", "loc-1");
    await w.vm.$nextTick();
    hooks.value = [hook];
    await w.vm.$nextTick();
    await w.get('button[aria-label="Create Quest"]').trigger("click");
    await flushPromises();
    expect(mocks.createQuest).toHaveBeenCalledWith(expect.objectContaining({ giver_npc_id: "npc-1", location_id: "loc-1" }));
    expect(w.find('button[aria-label="Create Quest"]').exists()).toBe(false);
    expect(w.text()).toContain("Created");

    await w.get('button[aria-label="View Quest →"]').trigger("click");
    expect(mocks.push).toHaveBeenLastCalledWith("/quests/quest-new");
    expect(mocks.ui.questGeneratorOpen).toBe(false);
    mocks.ui.questGeneratorOpen = true;
    await w.get('button[aria-label="Build flow →"]').trigger("click");
    expect(mocks.push).toHaveBeenLastCalledWith({ path: "/quests/quest-new", query: { view: "overview" } });
    expect(mocks.ui.questGeneratorOpen).toBe(false);
  });

  it("tells the DM when the created quest came back with no story beats", async () => {
    hooks.value = [hook];
    const w = mountPanel();
    await w.get('button[aria-label="Create Quest"]').trigger("click");
    await flushPromises();
    expect(mocks.toastInfo).toHaveBeenCalledTimes(1);
    expect(mocks.toastInfo.mock.calls[0]![0]).toContain("The Silent Bell");
  });

  it("a quest refused for quota opens the paywall, leaves the hook uncreated and the button usable", async () => {
    hooks.value = [hook];
    mocks.createQuest.mockRejectedValue({ message: "quota_exceeded" });
    const w = mountPanel();
    await w.get('button[aria-label="Create Quest"]').trigger("click");
    await flushPromises();
    expect(w.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(w.get('button[aria-label="Create Quest"]').attributes("disabled")).toBeUndefined();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("only the hook that was created turns into View / Build flow; the others stay creatable", async () => {
    hooks.value = [hook, { ...hook, title: "The Second Bell" }];
    const w = mountPanel();
    await w.findAll('button[aria-label="Create Quest"]')[1]!.trigger("click");
    await flushPromises();
    expect(w.findAll('button[aria-label="Create Quest"]')).toHaveLength(1);
    expect(w.findAll('button[aria-label="View Quest →"]')).toHaveLength(1);
    await w.get('button[aria-label="Create Quest"]').trigger("click");
    await flushPromises();
    expect(w.findAll('button[aria-label="View Quest →"]')).toHaveLength(2);
  });

  it("a fresh batch of hooks starts with nothing marked as created", async () => {
    hooks.value = [hook];
    const w = mountPanel();
    await w.get('button[aria-label="Create Quest"]').trigger("click");
    await flushPromises();
    expect(w.find('button[aria-label="View Quest →"]').exists()).toBe(true);
    hooks.value = [];
    await w.vm.$nextTick();
    await generate(w);
    hooks.value = [{ ...hook, title: "A New Bell" }];
    await w.vm.$nextTick();
    expect(w.find('button[aria-label="Create Quest"]').exists()).toBe(true);
    expect(w.find('button[aria-label="View Quest →"]').exists()).toBe(false);
  });

  it("an entity chip opens the sheet and closes the generator, but nothing for an entity the campaign has no record of", async () => {
    hooks.value = [hook];
    const w = mountPanel();
    const chips = w.findComponent({ name: "GeneratedEntityChips" });
    chips.vm.$emit("navigate", { kind: "npc", name: "Ghost", id: null });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.ui.questGeneratorOpen).toBe(true);
    chips.vm.$emit("navigate", { kind: "location", name: "Thornkeep", id: "loc-1" });
    expect(mocks.push).toHaveBeenCalledWith("/locations/loc-1");
    expect(mocks.ui.questGeneratorOpen).toBe(false);
  });
});
