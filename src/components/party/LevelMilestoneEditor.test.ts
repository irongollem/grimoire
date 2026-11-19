import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, type PropType } from "vue";
import LevelMilestoneEditor from "./LevelMilestoneEditor.vue";
import type { LevelMilestone } from "@/composables/party/useLevelMilestones";

const mocks = vi.hoisted(() => ({
  quests: { value: [] as Array<{ id: string; title: string }> },
  objectives: { value: [] as Array<{ id: string; description: string; questTitle: string }> },
  save: vi.fn(),
}));

vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: mocks.quests }) }));
vi.mock("@/composables/party/useLevelMilestones", () => ({
  useCampaignObjectives: () => ({ data: mocks.objectives }),
  useSaveLevelMilestone: () => ({ mutateAsync: mocks.save, isPending: { value: false } }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

/** The picker, reduced to its options and a way to choose one. */
const PickerStub = defineComponent({
  props: {
    modelValue: { type: String, required: true },
    options: { type: Array as PropType<Array<{ id: string; name: string }>>, required: true },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h(
        "div",
        { "data-picker": "" },
        props.options.map((o) =>
          h("button", { type: "button", "data-option": o.id, onClick: () => emit("update:modelValue", o.id) }, o.name),
        ),
      );
  },
});

function mountEditor(milestone: LevelMilestone | null = null, takenLevels: number[] = []) {
  return mount(LevelMilestoneEditor, {
    props: { milestone, takenLevels },
    global: { stubs: { EntityCombobox: PickerStub } },
  });
}

const existing: LevelMilestone = {
  id: "m1",
  level: 4,
  needs: 3,
  note: null,
  reachedAt: null,
  items: [
    { id: "s1", questId: "q1", objectiveId: null, label: "The Sunken Library", questTitle: null, inQuestId: "q1", done: false },
    { id: "s2", questId: "q2", objectiveId: null, label: "The Three Houses", questTitle: null, inQuestId: "q2", done: true },
    { id: "s3", questId: null, objectiveId: "o1", label: "Find the tower", questTitle: "The Old Map", inQuestId: "q9", done: false },
  ],
};

describe("LevelMilestoneEditor", () => {
  beforeEach(() => {
    mocks.quests.value = [
      { id: "q1", title: "The Sunken Library" },
      { id: "q2", title: "The Three Houses" },
      { id: "q3", title: "The Salt Road" },
    ];
    mocks.objectives.value = [{ id: "o1", description: "Find the tower", questTitle: "The Old Map" }];
    mocks.save.mockReset().mockResolvedValue("m1");
  });

  it("sends the quests and the objectives it waits on apart, by their own ids", async () => {
    const wrapper = mountEditor();
    await wrapper.find('[data-option="q:q3"]').trigger("click");
    await wrapper.find('[data-option="o:o1"]').trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: null, questIds: ["q3"], objectiveIds: ["o1"], needs: 1 }),
    );
    expect(wrapper.emitted("done")).toHaveLength(1);
  });

  it("does not offer a quest or objective it already lists", () => {
    const wrapper = mountEditor(existing);
    const offered = wrapper.findAll("[data-option]").map((b) => b.attributes("data-option"));
    expect(offered).toEqual(["q:q3"]);
  });

  it("removing an item pulls 'any K' down so it never needs more than it lists", async () => {
    const wrapper = mountEditor(existing);
    await wrapper.find('[aria-label="Remove The Three Houses"]').trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ needs: 2, questIds: ["q1"], objectiveIds: ["o1"] }));
  });

  it("offers only levels no other milestone brings, keeping its own", () => {
    const wrapper = mountEditor(existing, [3, 4, 5]);
    const levels = wrapper.find('select[aria-label="Level"]').findAll("option").map((o) => Number(o.element.value));
    expect(levels).toContain(4);
    expect(levels).not.toContain(3);
    expect(levels).not.toContain(5);
  });

  it("a refused save keeps the form open and says why", async () => {
    mocks.save.mockRejectedValue({ message: "A milestone cannot need more items than it lists" });
    const wrapper = mountEditor(existing);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.emitted("done")).toBeUndefined();
    expect(wrapper.text()).toContain("cannot need more items");
  });

  // CodeRabbit on #1227: a quest deleted since the milestone was saved left it needing 3 of 2, and saving only its note
  // was refused by the database.
  it("opening a milestone that needs more than it now lists asks only for what it lists", async () => {
    const wrapper = mountEditor({ ...existing, needs: 3, items: existing.items.slice(0, 2) });
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ needs: 2 }));
  });
});
