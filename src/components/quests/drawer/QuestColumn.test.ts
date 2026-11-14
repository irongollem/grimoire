import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuestColumn from "./QuestColumn.vue";
import type { Quest } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  updateQuest: vi.fn(),
  beats: [] as Array<{ id: string; visibility: string; visible_to: string[] | null }>,
}));

vi.mock("@/composables/quests/useQuests", () => ({ useUpdateQuest: () => ({ mutateAsync: mocks.updateQuest }) }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useQuestBeats: () => ({ data: ref(mocks.beats) }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([{ id: "m1", name: "Brannigan" }, { id: "m2", name: "Edda" }, { id: "m3", name: "Corin" }]) }) }));
vi.mock("@/composables/notes/useEntityMentionItems", () => ({ useEntityMentionItems: () => ({ mentionItems: ref([]) }) }));

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const BLANK_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: "quest-1", user_id: "u1", campaign_id: "campaign-1", parent_quest_id: null, title: "The Unseen",
    summary: "A rumor at the mill.", dm_content: null, status: "active", giver_npc_id: null, location_id: null,
    tags: [], started_at: null, resolved_at: null, entry_beat_id: null,
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...overrides,
  };
}

function mountColumn(overrides: Partial<Quest> = {}) {
  return mount(QuestColumn, {
    props: { quest: quest(overrides) },
    global: { stubs: { QuestObjectivesFoot: true, RichTextEditor: { name: "RichTextEditor", props: ["modelValue"], emits: ["update:modelValue"], template: '<textarea data-test="notes" :value="modelValue" />' }, RichTextViewer: { props: ["content"], template: '<div data-test="viewer">{{ content }}</div>' } } },
  });
}

describe("QuestColumn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.updateQuest.mockReset();
    mocks.beats = [];
    mocks.updateQuest.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  async function settle() {
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
  }

  // Fails if the standing line ignores the beats or their audiences: a quest has no audience of its own,
  // so it is hidden with no shown beat, the whole party when a shown beat has no audience (null wins
  // over a members-only one), and otherwise only the union of the shown beats' members.
  it("says where the quest stands and who the shown beats reach", () => {
    mocks.beats = [];
    expect(mountColumn().text()).toContain("Active · Hidden from players");
    mocks.beats = [{ id: "b1", visibility: "hidden", visible_to: null }, { id: "b2", visibility: "hidden", visible_to: ["m1"] }];
    expect(mountColumn().text()).toContain("Active · Hidden from players");
    mocks.beats = [{ id: "b1", visibility: "hidden", visible_to: null }, { id: "b2", visibility: "rumored", visible_to: null }];
    expect(mountColumn().text()).toContain("Active · Shown to the whole party");
    mocks.beats = [{ id: "b1", visibility: "revealed", visible_to: ["m1"] }, { id: "b2", visibility: "rumored", visible_to: null }];
    expect(mountColumn({ status: "completed" }).text()).toContain("Completed · Shown to the whole party");
    mocks.beats = [{ id: "b1", visibility: "revealed", visible_to: ["m1"] }, { id: "b2", visibility: "hidden", visible_to: ["m2"] }];
    expect(mountColumn().text()).toContain("Active · Shown to Brannigan");
    mocks.beats = [{ id: "b1", visibility: "revealed", visible_to: ["m1"] }, { id: "b2", visibility: "revealed", visible_to: ["m2"] }];
    expect(mountColumn().text()).toContain("Active · Shown to Brannigan and Edda");
  });

  // Fails if the line players read writes other columns, or does not trim / null an empty line.
  it("saves the players' line alone, and an emptied line as null", async () => {
    const wrapper = mountColumn();
    await wrapper.get('input[aria-label="Players read"]').setValue("  The mill is wrong.  ");
    await settle();
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "quest-1", update: { summary: "The mill is wrong." } });
    await wrapper.get('input[aria-label="Players read"]').setValue("   ");
    await settle();
    expect(mocks.updateQuest).toHaveBeenLastCalledWith({ id: "quest-1", update: { summary: null } });
  });

  it("an empty quest invites notes; Write notes opens the editor", async () => {
    const wrapper = mountColumn();
    expect(wrapper.text()).toContain("anything that belongs to no single scene");
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Write notes")!.trigger("click");
    expect(wrapper.find('[data-test="notes"]').exists()).toBe(true);
  });

  // Fails if notes writes anything but dm_content, or a blank paragraph is stored as text.
  it("saves the notes into dm_content only, and a blank document as null", async () => {
    const wrapper = mountColumn({ dm_content: doc("Old") });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Edit notes")!.trigger("click");
    await wrapper.getComponent({ name: "RichTextEditor" }).vm.$emit("update:modelValue", doc("New"));
    await settle();
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "quest-1", update: { dm_content: doc("New") } });
    await wrapper.getComponent({ name: "RichTextEditor" }).vm.$emit("update:modelValue", BLANK_DOC);
    await settle();
    expect(mocks.updateQuest).toHaveBeenLastCalledWith({ id: "quest-1", update: { dm_content: null } });
  });

  // Fails if the refetch after our own save (the normalised row) overwrites text typed since.
  it("does not reset what is being typed when a row comes back", async () => {
    const wrapper = mountColumn({ dm_content: doc("Old") });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Edit notes")!.trigger("click");
    await wrapper.getComponent({ name: "RichTextEditor" }).vm.$emit("update:modelValue", doc("Typing on"));
    await wrapper.setProps({ quest: quest({ dm_content: doc("Old"), updated_at: "2026-01-02T00:00:00Z" }) });
    expect((wrapper.get('[data-test="notes"]').element as HTMLTextAreaElement).value).toBe(doc("Typing on"));
    await settle();
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "quest-1", update: { dm_content: doc("Typing on") } });
  });

  it("Done returns to reading, after writing what was typed", async () => {
    const wrapper = mountColumn({ dm_content: doc("Old") });
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Edit notes")!.trigger("click");
    await wrapper.getComponent({ name: "RichTextEditor" }).vm.$emit("update:modelValue", doc("Fresh"));
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Done")!.trigger("click");
    await flushPromises();
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "quest-1", update: { dm_content: doc("Fresh") } });
    expect(wrapper.find('[data-test="notes"]').exists()).toBe(false);
  });

  it("forwards a pick of a source beat from the objectives foot", async () => {
    const wrapper = mountColumn();
    wrapper.getComponent({ name: "QuestObjectivesFoot" }).vm.$emit("select-beat", "b1");
    expect(wrapper.emitted("select-beat")).toEqual([["b1"]]);
  });
});
