import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestObjectivesSection from "./QuestObjectivesSection.vue";
import type { QuestObjective } from "@/types/quest.types";

// Plain arrays here, not refs: `vi.hoisted` runs before "vue" is evaluated.
const mocks = vi.hoisted(() => ({
  objectives: [] as QuestObjective[],
  assertStatus: vi.fn(),
  createObjective: vi.fn(),
  updateObjective: vi.fn(),
  deleteObjective: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: ref(mocks.objectives) }),
  useAssertQuestObjectiveStatus: () => ({ mutateAsync: mocks.assertStatus }),
  useCreateObjective: () => ({ mutateAsync: mocks.createObjective }),
  useUpdateObjective: () => ({ mutateAsync: mocks.updateObjective }),
  useDeleteObjective: () => ({ mutateAsync: mocks.deleteObjective }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }) }));

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
  return mount(QuestObjectivesSection, { props: { questId: "quest-1" }, global: { stubs: { QuestSettledPrompt: true } } });
}
const objectiveInput = (w: ReturnType<typeof mountLifecycle>) => w.get('input[placeholder="Add objective…"]');

describe("QuestObjectivesSection", () => {
  beforeEach(() => {
    mocks.objectives = [];
    mocks.assertStatus.mockReset();
    mocks.createObjective.mockReset();
    mocks.updateObjective.mockReset();
    mocks.deleteObjective.mockReset();
    mocks.toastError.mockReset();
  });

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
});
