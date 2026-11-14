import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QuestColumn from "./QuestColumn.vue";
import type { Quest } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  updateQuest: vi.fn(),
  party: [{ id: "p1" }, { id: "p2" }, { id: "p3" }, { id: "p4" }] as Array<{ id: string }>,
}));

vi.mock("@/composables/quests/useQuests", () => ({ useUpdateQuest: () => ({ mutateAsync: mocks.updateQuest }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref(mocks.party) }) }));
vi.mock("@/composables/notes/useEntityMentionItems", () => ({ useEntityMentionItems: () => ({ mentionItems: ref([]) }) }));

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const BLANK_DOC = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

function quest(overrides: Partial<Quest> = {}): Quest {
  return {
    id: "quest-1", user_id: "u1", campaign_id: "campaign-1", parent_quest_id: null, title: "The Unseen",
    summary: "A rumor at the mill.", dm_content: null, status: "active", giver_npc_id: null, location_id: null,
    tags: [], player_visible_to: [], started_at: null, resolved_at: null, entry_beat_id: null,
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
    mocks.updateQuest.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  async function settle() {
    await vi.advanceTimersByTimeAsync(2100);
    await flushPromises();
  }

  // Fails on a miscount: ids of members who left the party must not count, none/some/all must read differently.
  it("says where the quest stands and how many of the party have it", () => {
    expect(mountColumn().text()).toContain("Active · Not shared yet");
    expect(mountColumn({ player_visible_to: ["p1", "p3"] }).text()).toContain("Shared with 2 of 4");
    expect(mountColumn({ player_visible_to: ["p1", "p2", "p3", "p4"] }).text()).toContain("Shared with the whole party");
    expect(mountColumn({ player_visible_to: ["p1", "gone"] }).text()).toContain("Shared with 1 of 4");
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
