import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import QuestBeatMarks from "./QuestBeatMarks.vue";
import type { QuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  setVisibility: vi.fn(), shareIfSeen: vi.fn(), mark: vi.fn(), updateQuest: vi.fn(),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useMarkQuestMove: () => ({ mutateAsync: mocks.mark, isPending: { value: false } }),
  useQuestConsequences: () => ({ data: ref([
    { id: "r1", on_beat_id: "b1", on_beat_outcome: "arrived", action: "grant_knowledge", target_objective_id: null, action_payload: { text: "Learns the code" } },
    { id: "r2", on_beat_id: "b1", on_beat_outcome: "failed", action: "grant_knowledge", target_objective_id: null, action_payload: { text: "Alarm rings" } },
  ]) }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: ref([]) }),
  useUpdateQuest: () => ({ mutateAsync: mocks.updateQuest, isPending: { value: false } }),
}));
vi.mock("@/composables/quests/useSetBeatVisibility", () => ({ useSetBeatVisibility: () => mocks.setVisibility }));
vi.mock("@/composables/quests/useShareQuest", () => ({ useShareQuest: () => ({ shareIfBeatSeen: mocks.shareIfSeen }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

const beat = { id: "b1", quest_id: "q1", campaign_id: "c1", title: "Vault", kind: "combat", visibility: "hidden", updated_at: "t0" } as QuestBeat;
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

  // Fails if the payoff lines creep back into the column header; they live in the wide part.
  it("holds only the marks and the track, even when the beat has payoff rules", () => {
    const text = mountMarks().text();
    expect(text).not.toContain("On arrival");
    expect(text).not.toContain("If it goes wrong");
    expect(text).not.toContain("Learns the code");
  });

  const dot = (wrapper: ReturnType<typeof mountMarks>, step: string) =>
    wrapper.findAll("button").find((b) => b.attributes("aria-label") === step)!;

  it("picking a step on the track writes it through the one visibility write", async () => {
    mocks.setVisibility.mockResolvedValue(undefined);
    await dot(mountMarks(), "revealed").trigger("click");
    expect(mocks.setVisibility).toHaveBeenCalledWith(expect.objectContaining({ id: "b1", updated_at: "t0" }), "revealed");
  });

  // Fails if the floor is not handed to the track, letting a reached beat be hidden again.
  it("steps below the floor are disabled and write nothing", async () => {
    const wrapper = mountMarks({ beat: { ...beat, visibility: "revealed" }, floor: "revealed" });
    expect(dot(wrapper, "hidden").attributes("disabled")).toBeDefined();
    expect(dot(wrapper, "rumored").attributes("disabled")).toBeDefined();
    await dot(wrapper, "hidden").trigger("click");
    expect(mocks.setVisibility).not.toHaveBeenCalled();
  });

  // Fails if a mark goes back to sharing the quest itself: a move shares server-side now.
  it("a mark moves the party and shares nothing itself", async () => {
    await box(mountMarks(), "Party here").setValue(true);
    await flushPromises();
    expect(mocks.shareIfSeen).not.toHaveBeenCalled();
    expect(mocks.setVisibility).not.toHaveBeenCalled();
  });

  // Fails if a rejected visibility write is swallowed or throws unhandled.
  it("a failed visibility write does not throw out of the click", async () => {
    mocks.setVisibility.mockRejectedValue(new Error("nope"));
    await dot(mountMarks(), "rumored").trigger("click");
    await flushPromises();
    expect(mocks.setVisibility).toHaveBeenCalled();
  });
});
