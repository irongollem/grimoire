import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import QuestBeatMarks from "./QuestBeatMarks.vue";
import type { QuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  mark: vi.fn(), updateQuest: vi.fn(), updateBeat: vi.fn(),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useMarkQuestMove: () => ({ mutateAsync: mocks.mark, isPending: { value: false } }),
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.updateBeat }),
  useQuestConsequences: () => ({ data: ref([
    { id: "r1", on_beat_id: "b1", on_beat_outcome: "arrived", action: "grant_knowledge", target_objective_id: null, action_payload: { text: "Learns the code" } },
    { id: "r2", on_beat_id: "b1", on_beat_outcome: "failed", action: "grant_knowledge", target_objective_id: null, action_payload: { text: "Alarm rings" } },
  ]) }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: ref([]) }),
  useUpdateQuest: () => ({ mutateAsync: mocks.updateQuest, isPending: { value: false } }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

const beat = { id: "b1", quest_id: "q1", campaign_id: "c1", title: "Vault", kind: "combat", visibility: "hidden" } as QuestBeat;
const presentation = (over: Record<string, unknown> = {}) => ({ currentThreadIds: [], isFailed: false, ...over }) as never;

function mountMarks(props: Record<string, unknown> = {}) {
  return mount(QuestBeatMarks, { props: { beat, presentation: presentation(), threadId: "t1", entryBeatId: "other", ...props } });
}
const box = (wrapper: ReturnType<typeof mountMarks>, label: string) =>
  wrapper.findAll("label").find((l) => l.text() === label)!.find("input");

beforeEach(() => { vi.clearAllMocks(); mocks.mark.mockResolvedValue({}); mocks.updateQuest.mockResolvedValue({}); });

describe("QuestBeatMarks", () => {
  it("checking Entry writes the quest's entry beat (fails if the write targets the wrong quest or beat)", async () => {
    const wrapper = mountMarks();
    await box(wrapper, "Entry").setValue(true);
    expect(mocks.updateQuest).toHaveBeenCalledWith({ id: "q1", update: { entry_beat_id: "b1" } });
  });

  it("Entry is checked and disabled on the entry beat, since a quest always has one (fails if it can be unchecked)", () => {
    const entry = box(mountMarks({ entryBeatId: "b1" }), "Entry");
    expect((entry.element as HTMLInputElement).checked).toBe(true);
    expect(entry.attributes("disabled")).toBeDefined();
  });

  it("checking Party here marks a party_here move on the focus thread", async () => {
    await box(mountMarks({ sessionId: "s1" }), "Party here").setValue(true);
    expect(mocks.mark).toHaveBeenCalledWith({ kind: "party_here", campaignId: "c1", questId: "q1", threadId: "t1", beatId: "b1", sessionId: "s1" });
  });

  it("Party here is checked and disabled where the focus thread stands, not for another thread's cursor", () => {
    const here = box(mountMarks({ presentation: presentation({ currentThreadIds: ["t1"] }) }), "Party here");
    expect((here.element as HTMLInputElement).checked).toBe(true);
    expect(here.attributes("disabled")).toBeDefined();
    const other = box(mountMarks({ presentation: presentation({ currentThreadIds: ["t2"] }) }), "Party here");
    expect((other.element as HTMLInputElement).checked).toBe(false);
  });

  it("checking Failed marks a failed move; a failed beat shows it checked and disabled", async () => {
    await box(mountMarks(), "Failed").setValue(true);
    expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ kind: "failed", beatId: "b1" }));
    const failed = box(mountMarks({ presentation: presentation({ isFailed: true }) }), "Failed");
    expect((failed.element as HTMLInputElement).checked).toBe(true);
    expect(failed.attributes("disabled")).toBeDefined();
  });

  it("with no thread, Party here and Failed cannot mark anything", async () => {
    const wrapper = mountMarks({ threadId: null });
    expect(box(wrapper, "Party here").attributes("disabled")).toBeDefined();
    expect(box(wrapper, "Failed").attributes("disabled")).toBeDefined();
    expect(mocks.mark).not.toHaveBeenCalled();
  });

  it("lists payoffs under On arrival and If it goes wrong separately", () => {
    const text = mountMarks().text();
    expect(text).toMatch(/On arrival[\s\S]*Learns the code[\s\S]*If it goes wrong[\s\S]*Alarm rings/);
    expect(text).not.toMatch(/On arrival[\s\S]*Alarm rings[\s\S]*If it goes wrong/);
  });

  it("changing visibility writes it through the beat update", async () => {
    const wrapper = mountMarks();
    await wrapper.findAll("button").find((b) => b.text() === "Revealed")!.trigger("click");
    expect(mocks.updateBeat).toHaveBeenCalledWith({ id: "b1", questId: "q1", update: { visibility: "revealed" } });
  });
});
