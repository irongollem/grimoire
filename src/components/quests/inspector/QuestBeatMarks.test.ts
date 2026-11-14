import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import QuestBeatMarks from "./QuestBeatMarks.vue";
import type { ThreadStanding } from "@/lib/quests/moves";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  setVisibility: vi.fn(), mark: vi.fn(), updateQuest: vi.fn(),
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
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: String }) }));

const beat = { id: "b1", quest_id: "q1", campaign_id: "c1", title: "Vault", kind: "combat", visibility: "hidden", updated_at: "t0" } as QuestBeat;
const presentation = (over: Record<string, unknown> = {}) => ({ currentThreadIds: [], isFailed: false, ...over }) as never;

const here: ThreadStanding = { partyBeatId: "b1", reachedBeatIds: new Set(["b1"]), entryBeatId: "b1" };
function mountMarks(props: Record<string, unknown> = {}) {
  return mount(QuestBeatMarks, { attachTo: document.body, props: { beat, beats: [beat], edges: [], standing: here, presentation: presentation(), threadId: "t1", entryBeatId: "other", ...props } });
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
    expect(mocks.mark).toHaveBeenCalledWith({ kind: "party_here", campaignId: "c1", questId: "q1", threadId: "t1", beatId: "b1", sessionId: "s1", via: undefined });
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

  // Fails if a mark writes a beat visibility itself: a move shows the beat server-side now.
  it("a mark moves the party and writes no visibility itself", async () => {
    await box(mountMarks(), "Party here").setValue(true);
    await flushPromises();
    expect(mocks.setVisibility).not.toHaveBeenCalled();
  });


  describe("a beat further ahead (#1194)", () => {
    const titled = (id: string, title: string) => ({ ...beat, id, title }) as QuestBeat;
    const beats = [titled("s", "Gate"), titled("k", "Kennels"), titled("t", "Tunnel"), beat];
    const link = (source: string, target: string) => ({ source_beat_id: source, target_beat_id: target }) as QuestBeatEdge;
    const standing: ThreadStanding = { partyBeatId: "s", reachedBeatIds: new Set(["s"]), entryBeatId: "s" };
    const popover = () => document.body.querySelector<HTMLElement>("[data-slip]");

    it("with one way it marks directly and sends that way", async () => {
      await box(mountMarks({ beats, standing, edges: [link("s", "k"), link("k", "b1")] }), "Party here").setValue(true);
      expect(popover()).toBeNull();
      expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ kind: "party_here", via: ["s", "k", "b1"] }));
    });

    it("with two ways it asks first, marks nothing until one is picked, and sends that way (fails if it guesses the shortest)", async () => {
      const wrapper = mountMarks({ beats, standing, edges: [link("s", "k"), link("k", "b1"), link("s", "k2"), link("k2", "t"), link("t", "b1")] });
      await box(wrapper, "Failed").setValue(true);
      expect(mocks.mark).not.toHaveBeenCalled();
      const radios = [...document.body.querySelectorAll<HTMLInputElement>("[data-slip] input[type=radio]")];
      expect(radios).toHaveLength(2);
      const confirm = [...document.body.querySelectorAll<HTMLButtonElement>("[data-slip] button")].find((b) => b.textContent?.includes("Mark failed"))!;
      expect(confirm.disabled).toBe(true);
      radios[1]!.click();
      await flushPromises();
      confirm.click();
      await flushPromises();
      expect(mocks.mark).toHaveBeenCalledWith(expect.objectContaining({ kind: "failed", via: ["s", "k2", "t", "b1"] }));
      wrapper.unmount();
    });

    // Fails if a tick that only opened the question stays ticked after the popover is dismissed.
    it("dismissing the question marks nothing and leaves the box unticked", async () => {
      const wrapper = mountMarks({ beats, standing, edges: [link("s", "k"), link("k", "b1"), link("s", "k2"), link("k2", "b1")] });
      const failed = box(wrapper, "Failed");
      await failed.setValue(true);
      expect(popover()).not.toBeNull();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await flushPromises();
      expect(popover()).toBeNull();
      expect((box(wrapper, "Failed").element as HTMLInputElement).checked).toBe(false);
      expect(mocks.mark).not.toHaveBeenCalled();
      wrapper.unmount();
    });
  });
});
