import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestOverviewLifecycle from "./QuestOverviewLifecycle.vue";
import type { Quest, QuestObjective } from "@/types/quest.types";

// Plain arrays here, not refs — `vi.hoisted` runs before the module graph
// (including "vue" itself) is evaluated, so a `ref()` call inside it throws.
// Each mock composable below wraps the current array in a fresh `ref()` at
// call time instead, which is late enough, and is all the template needs:
// it reads `objectives` directly, relying on Vue's script-setup auto-unwrap,
// so a mock that is not an actual `Ref` makes `v-for` iterate the mock
// object's own entries instead of the array inside it.
const mocks = vi.hoisted(() => ({
  objectives: [] as QuestObjective[],
  subQuests: [] as Array<{ id: string; title: string; status: string }>,
  notes: [] as Array<{ id: string; content: string | null; is_private: boolean; updated_at: string }>,
  assertStatus: vi.fn(),
  createObjective: vi.fn(),
  updateObjective: vi.fn(),
  deleteObjective: vi.fn(),
  deleteQuest: vi.fn(),
  createScriptoriumDocument: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/notes/useEntityNotes", () => ({ useEntityNotes: () => ({ data: ref(mocks.notes) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: ref([]) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: ref([]) }) }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useCreateScriptoriumDocument: () => ({ mutateAsync: mocks.createScriptoriumDocument }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: ref(mocks.objectives) }),
  useSubQuests: () => ({ data: ref(mocks.subQuests) }),
  useAssertQuestObjectiveStatus: () => ({ mutateAsync: mocks.assertStatus }),
  useCreateObjective: () => ({ mutateAsync: mocks.createObjective }),
  useUpdateObjective: () => ({ mutateAsync: mocks.updateObjective }),
  useDeleteObjective: () => ({ mutateAsync: mocks.deleteObjective }),
  useDeleteQuest: () => ({ mutateAsync: mocks.deleteQuest }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));

const quest = {
  id: "quest-1",
  title: "The Unseen",
  status: "active",
  giver_npc_id: null,
  location_id: null,
} as Quest;

function objective(overrides: Partial<QuestObjective> & { id: string }): QuestObjective {
  return {
    quest_id: "quest-1",
    description: "Find the missing miller",
    status: "pending",
    is_player_visible: false,
    sort_order: 0,
    ...overrides,
  };
}

function mountLifecycle() {
  return mount(QuestOverviewLifecycle, {
    props: { quest },
    global: {
      stubs: {
        // Isolate this component's own ledger/lifecycle logic from its
        // children's — QuestConsequencesPanel, QuestBackfillPanel and
        // EntityCalendarSection have their own composables and their own test
        // files.
        QuestConsequencesPanel: true,
        QuestBackfillPanel: true,
        EntityCalendarSection: true,
        QuestSidebarPanels: true,
      },
    },
  });
}

describe("QuestOverviewLifecycle", () => {
  beforeEach(() => {
    mocks.objectives = [];
    mocks.subQuests = [];
    mocks.notes = [];
    mocks.assertStatus.mockReset();
    mocks.createObjective.mockReset();
    mocks.updateObjective.mockReset();
    mocks.deleteObjective.mockReset();
    mocks.deleteQuest.mockReset();
    mocks.createScriptoriumDocument.mockReset();
    mocks.confirm.mockReset();
    mocks.push.mockReset();
  });

  // The ledger is quest-level by design (#792): a beat only ever declares the
  // rules that move an entry here, it never holds an objectives list of its
  // own. This is also the regression guard for "verify nothing else on the
  // page still edits a beat" — nothing here reaches for a beat id, a beat
  // editor, or beat-scoped loot/attachments.
  it("owns the objective ledger at the quest level, not the beat level", () => {
    mocks.objectives = [objective({ id: "obj-1", description: "Find the missing miller" })];
    const wrapper = mountLifecycle();
    expect(wrapper.text()).toContain("Find the missing miller");
    expect(wrapper.findComponent({ name: "QuestConsequencesPanel" }).props("scope")).toBe("quest");
    expect(wrapper.findComponent({ name: "QuestBeatLootPanel" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "QuestBeatAttachmentsPanel" }).exists()).toBe(false);
  });

  it("adds an objective to the quest-owned ledger", async () => {
    const wrapper = mountLifecycle();
    await wrapper.find('input[placeholder="Add objective…"]').setValue("Warn the village");
    await wrapper.findAll("button").find((button) => button.attributes("aria-label") === "Add objective")!.trigger("click");
    expect(mocks.createObjective).toHaveBeenCalledWith(expect.objectContaining({
      quest_id: "quest-1",
      description: "Warn the village",
      status: "pending",
    }));
  });

  // Routed through the RPC (`assert_quest_objective_status`), never a raw
  // PATCH — the consequence engine watches this exact write, and a column
  // update would change the ledger without it noticing (#794).
  it("toggles an objective's status through the assert RPC, not a raw field update", async () => {
    mocks.objectives = [objective({ id: "obj-1", status: "pending" })];
    const wrapper = mountLifecycle();
    // "Open — click for completed" is `statusTooltip` for a pending objective —
    // pending's own label plus the state `nextObjectiveStatus` cycles to next.
    await wrapper.find('[aria-label="Open — click for completed"]').trigger("click");
    await flushPromises();
    expect(mocks.assertStatus).toHaveBeenCalledWith({ objectiveId: "obj-1", questId: "quest-1", status: "complete" });
    expect(mocks.updateObjective).not.toHaveBeenCalled();
  });

  it("disables the reveal control on a dormant objective, since dormant + visible is refused at the database", () => {
    mocks.objectives = [objective({ id: "obj-1", status: "dormant" })];
    const wrapper = mountLifecycle();
    const revealButton = wrapper.findAll("button").find((button) => (button.attributes("aria-label") ?? "").includes("Dormant"));
    expect(revealButton?.attributes("disabled")).toBeDefined();
  });

  it("deletes the quest and returns to the quest list, never to the quest's own page", async () => {
    mocks.confirm.mockResolvedValue(true);
    const wrapper = mountLifecycle();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Delete quest")!.trigger("click");
    await flushPromises();
    expect(mocks.deleteQuest).toHaveBeenCalledWith("quest-1");
    expect(mocks.push).toHaveBeenCalledWith("/quests");
  });

  it("sends the quest to Scriptorium as a document, not as a page navigation to a beat", async () => {
    mocks.createScriptoriumDocument.mockResolvedValue({ id: "doc-1" });
    const wrapper = mountLifecycle();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Send to Scriptorium")!.trigger("click");
    await flushPromises();
    expect(mocks.createScriptoriumDocument).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium/doc-1");
  });

  it("passes quest-level facets (sub-quests, shared notes, calendar) to their own panels rather than editing them inline", () => {
    mocks.subQuests = [{ id: "sub-1", title: "The docks lead", status: "active" }];
    mocks.notes = [{ id: "note-1", content: "We should ask the harbormaster.", is_private: false, updated_at: "2026-01-01" }];
    const wrapper = mountLifecycle();
    const sidebar = wrapper.findComponent({ name: "QuestSidebarPanels" });
    expect(sidebar.props("subQuests")).toEqual(mocks.subQuests);
    expect(sidebar.props("sharedNotes")).toHaveLength(1);
    expect(wrapper.findComponent({ name: "EntityCalendarSection" }).props("entityId")).toBe("quest-1");
  });
});
