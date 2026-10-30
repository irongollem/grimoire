import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
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
  subQuests: [] as Array<{ id: string; title: string; status: string; parent_quest_id: string | null }>,
  fetchNpc: vi.fn(),
  fetchLocation: vi.fn(),
  notes: [] as Array<{ id: string; content: string | null; is_private: boolean; updated_at: string }>,
  assertStatus: vi.fn(),
  createObjective: vi.fn(),
  updateObjective: vi.fn(),
  deleteObjective: vi.fn(),
  deleteQuest: vi.fn(),
  createScriptoriumDocument: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/notes/useEntityNotes", () => ({ useEntityNotes: () => ({ data: ref(mocks.notes) }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useFetchNpc: () => mocks.fetchNpc }));
vi.mock("@/composables/locations/useLocations", () => ({ useFetchLocation: () => mocks.fetchLocation }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useCreateScriptoriumBook: () => ({ mutateAsync: mocks.createScriptoriumDocument }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: ref(mocks.objectives) }),
  useQuests: () => ({ data: ref(mocks.subQuests) }),
  useAssertQuestObjectiveStatus: () => ({ mutateAsync: mocks.assertStatus }),
  useCreateObjective: () => ({ mutateAsync: mocks.createObjective }),
  useUpdateObjective: () => ({ mutateAsync: mocks.updateObjective }),
  useDeleteObjective: () => ({ mutateAsync: mocks.deleteObjective }),
  useDeleteQuest: () => ({ mutateAsync: mocks.deleteQuest }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }) }));

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
    due_year: null,
    due_month: null,
    due_day: null,
    ...overrides,
  };
}

function mountLifecycle() {
  setActivePinia(createPinia());
  return mount(QuestOverviewLifecycle, {
    props: { quest },
    global: {
      stubs: {
        // Isolate this component's own ledger/lifecycle logic from its
        // children's — QuestRulesPanel, QuestBackfillPanel and
        // EntityCalendarSection have their own composables and their own test
        // files.
        QuestRulesPanel: true,
        QuestClocksPanel: true,
        QuestSettledPrompt: true,
        QuestBackfillPanel: true,
        EntityCalendarSection: true,
        QuestSidebarPanels: true,
        // Needs Pinia (useQuota/useSubscription) to render for real — this
        // file has no store set up, and the quota paywall it opens on a
        // scriptorium_documents rejection isn't what these tests exercise.
        PaywallModal: true,
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
    mocks.fetchNpc.mockReset();
    mocks.fetchLocation.mockReset();
    mocks.confirm.mockReset();
    mocks.push.mockReset();
    mocks.toastError.mockReset();
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
    // "Open: click for completed" is `statusTooltip` for a pending objective —
    // pending's own label plus the state `nextObjectiveStatus` cycles to next.
    await wrapper.find('[aria-label="Open: click for completed"]').trigger("click");
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

  it("reads the giver and place as single rows at click time, and only when the quest has them", async () => {
    mocks.createScriptoriumDocument.mockResolvedValue({ id: "doc-1" });
    const wrapper = mountLifecycle();
    const send = () => wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Send to Scriptorium")!.trigger("click");
    await send();
    await flushPromises();
    expect(mocks.fetchNpc).not.toHaveBeenCalled();
    expect(mocks.fetchLocation).not.toHaveBeenCalled();

    const linked = { ...quest, giver_npc_id: "npc-1", location_id: "loc-1" } as Quest;
    mocks.fetchNpc.mockResolvedValue({ id: "npc-1", name: "Oarus" });
    mocks.fetchLocation.mockResolvedValue({ id: "loc-1", name: "The Docks" });
    await wrapper.setProps({ quest: linked });
    await send();
    await flushPromises();
    expect(mocks.fetchNpc).toHaveBeenCalledWith("npc-1");
    expect(mocks.fetchLocation).toHaveBeenCalledWith("loc-1");
    expect(mocks.createScriptoriumDocument).toHaveBeenCalledTimes(2);
  });

  it("passes quest-level facets (sub-quests, shared notes, calendar) to their own panels rather than editing them inline", () => {
    const sub = { id: "sub-1", title: "The docks lead", status: "active", parent_quest_id: "quest-1" };
    mocks.subQuests = [sub, { id: "other", title: "Elsewhere", status: "active", parent_quest_id: "quest-9" }, { id: "root", title: "Root", status: "active", parent_quest_id: null }];
    mocks.notes = [{ id: "note-1", content: "We should ask the harbormaster.", is_private: false, updated_at: "2026-01-01" }];
    const wrapper = mountLifecycle();
    const sidebar = wrapper.findComponent({ name: "QuestSidebarPanels" });
    expect(sidebar.props("subQuests")).toEqual([sub]);
    expect(sidebar.props("sharedNotes")).toHaveLength(1);
    expect(wrapper.findComponent({ name: "EntityCalendarSection" }).props("entityId")).toBe("quest-1");
  });

  const objectiveInput = (w: ReturnType<typeof mountLifecycle>) => w.get('input[placeholder="Add objective…"]');
  const appButton = (w: ReturnType<typeof mountLifecycle>, label: string) => w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!;

  it("Enter adds the objective trimmed, numbered after those already there, and empties the box; spaces alone add nothing", async () => {
    mocks.objectives = [objective({ id: "a", sort_order: 0 }), objective({ id: "b", sort_order: 1 })];
    const wrapper = mountLifecycle();
    await objectiveInput(wrapper).setValue("   ");
    await objectiveInput(wrapper).trigger("keydown.enter");
    expect(mocks.createObjective).not.toHaveBeenCalled();
    expect(wrapper.get('button[aria-label="Add objective"]').attributes("disabled")).toBeDefined();
    await objectiveInput(wrapper).setValue("  Warn the village  ");
    await objectiveInput(wrapper).trigger("keydown.enter");
    expect(mocks.createObjective).toHaveBeenCalledWith(expect.objectContaining({ description: "Warn the village", sort_order: 2, is_player_visible: false }));
    expect((objectiveInput(wrapper).element as HTMLInputElement).value).toBe("");
  });

  it("the reveal control flips what players can see, both ways", async () => {
    mocks.objectives = [objective({ id: "hid", is_player_visible: false }), objective({ id: "vis", is_player_visible: true })];
    const wrapper = mountLifecycle();
    await wrapper.get('[aria-label="Hidden from players: click to reveal"]').trigger("click");
    await wrapper.get('[aria-label="Visible to players: click to hide"]').trigger("click");
    expect(mocks.updateObjective.mock.calls).toEqual([
      [{ id: "hid", questId: "quest-1", update: { is_player_visible: true } }],
      [{ id: "vis", questId: "quest-1", update: { is_player_visible: false } }],
    ]);
  });

  it("a due date is stored year, month and day, and clearing it stores nulls; a refused save is toasted", async () => {
    mocks.objectives = [objective({ id: "obj-1" })];
    const wrapper = mountLifecycle();
    const due = () => wrapper.findComponent({ name: "QuestObjectiveDueDate" });
    due().vm.$emit("change", { year: 1495, month: 3, day: 12 });
    await flushPromises();
    expect(mocks.updateObjective).toHaveBeenLastCalledWith({ id: "obj-1", questId: "quest-1", update: { due_year: 1495, due_month: 3, due_day: 12 } });
    due().vm.$emit("change", null);
    await flushPromises();
    expect(mocks.updateObjective).toHaveBeenLastCalledWith({ id: "obj-1", questId: "quest-1", update: { due_year: null, due_month: null, due_day: null } });
    mocks.updateObjective.mockRejectedValueOnce(new Error("Not allowed"));
    due().vm.$emit("change", { year: 1496, month: 1, day: 1 });
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalledWith("Not allowed");
  });

  it("removing an objective deletes that one from this quest", async () => {
    mocks.objectives = [objective({ id: "obj-1" }), objective({ id: "obj-2", description: "Second" })];
    const wrapper = mountLifecycle();
    await wrapper.findAll('button[aria-label="Remove objective"]')[1]!.trigger("click");
    expect(mocks.deleteObjective).toHaveBeenCalledWith({ id: "obj-2", questId: "quest-1" });
  });

  it("asks which quest is being deleted, by title, or by 'this quest' when it has none", async () => {
    mocks.confirm.mockResolvedValue(false);
    const wrapper = mountLifecycle();
    await appButton(wrapper, "Delete quest").trigger("click");
    expect(mocks.confirm).toHaveBeenLastCalledWith('Delete "The Unseen"?');
    await wrapper.setProps({ quest: { ...quest, title: "" } as Quest });
    await appButton(wrapper, "Delete quest").trigger("click");
    expect(mocks.confirm).toHaveBeenLastCalledWith('Delete "this quest"?');
    expect(mocks.deleteQuest).not.toHaveBeenCalled();
  });

  it("a second Delete click while the first is still deleting does nothing, and the button works again afterwards", async () => {
    mocks.confirm.mockResolvedValue(true);
    let finish: () => void = () => {};
    mocks.deleteQuest.mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve; }));
    const wrapper = mountLifecycle();
    await appButton(wrapper, "Delete quest").trigger("click");
    await flushPromises();
    await appButton(wrapper, "Delete quest").trigger("click");
    await flushPromises();
    expect(mocks.deleteQuest).toHaveBeenCalledTimes(1);
    finish();
    await flushPromises();
    mocks.deleteQuest.mockResolvedValue(undefined);
    await appButton(wrapper, "Delete quest").trigger("click");
    await flushPromises();
    expect(mocks.deleteQuest).toHaveBeenCalledTimes(2);
  });

  it("the Scriptorium copy belongs to the quest's own campaign", async () => {
    mocks.createScriptoriumDocument.mockResolvedValue({ id: "doc-1" });
    const wrapper = mountLifecycle();
    await wrapper.setProps({ quest: { ...quest, campaign_id: "campaign-7" } as Quest });
    await appButton(wrapper, "Send to Scriptorium").trigger("click");
    await flushPromises();
    expect(mocks.createScriptoriumDocument).toHaveBeenCalledWith({
      book: expect.objectContaining({ campaign_id: "campaign-7", kind: "book" }),
      chapters: [{ content: expect.objectContaining({ type: "doc" }) }],
    });
    // The formatter's HTML body and word count are not columns of a book.
    const [{ book }] = mocks.createScriptoriumDocument.mock.calls[0] as [{ book: object }];
    expect(book).not.toHaveProperty("content");
    expect(book).not.toHaveProperty("word_count");
  });

  it("a Scriptorium document refused for quota opens the paywall quietly; any other failure is toasted", async () => {
    const wrapper = mountLifecycle();
    mocks.createScriptoriumDocument.mockRejectedValueOnce({ message: "quota_exceeded" });
    await appButton(wrapper, "Send to Scriptorium").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    mocks.createScriptoriumDocument.mockRejectedValueOnce(new Error("Disk full"));
    await appButton(wrapper, "Send to Scriptorium").trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalledWith("Disk full");
  });
});
