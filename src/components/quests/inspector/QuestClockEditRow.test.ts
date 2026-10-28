import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestClockEditRow from "./QuestClockEditRow.vue";
import type { QuestClock } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), error: vi.fn() }));

vi.mock("@/composables/quests/useQuestClocks", () => ({
  useUpdateQuestClock: () => ({ mutateAsync: mocks.update }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.error, fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }),
}));

const clock = { id: "c1", label: "The ritual", segments: 6, filled: 3 } as QuestClock;

describe("QuestClockEditRow", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.error.mockReset();
  });

  async function setSegments(wrapper: ReturnType<typeof mount>, value: string) {
    const input = wrapper.get('input[aria-label="Clock segments"]');
    await input.setValue(value);
    await input.trigger("change");
    await flushPromises();
    return input;
  }

  it("saves a new segment count", async () => {
    mocks.update.mockResolvedValue("q1");
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setSegments(wrapper, "8");
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", questId: "q1", update: { segments: 8 } });
    expect(mocks.error).not.toHaveBeenCalled();
  });

  it("snaps the input back and shows the error when the server refuses", async () => {
    mocks.update.mockRejectedValue(new Error("A clock with 3 filled cannot be shortened"));
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setSegments(wrapper, "3");
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("cannot be shortened"));
    expect((wrapper.get('input[aria-label="Clock segments"]').element as HTMLInputElement).value).toBe("6");
  });

  async function setLabel(wrapper: ReturnType<typeof mount>, value: string) {
    const input = wrapper.get('input[aria-label="Clock label"]');
    await input.setValue(value);
    await input.trigger("change");
    await flushPromises();
    return input;
  }

  it("saves a renamed clock trimmed, and nothing when the name is unchanged", async () => {
    mocks.update.mockResolvedValue("q1");
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setLabel(wrapper, "  The ritual  ");
    expect(mocks.update).not.toHaveBeenCalled();
    await setLabel(wrapper, "  The rite  ");
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", questId: "q1", update: { label: "The rite" } });
  });

  it("a blank name puts the old one back instead of saving", async () => {
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setLabel(wrapper, "   ");
    expect(mocks.update).not.toHaveBeenCalled();
    // What the DM sees, not only the model: the typed spaces must not stay in the box.
    expect((wrapper.get('input[aria-label="Clock label"]').element as HTMLInputElement).value).toBe("The ritual");
  });

  it("an out-of-range segment count shows the stored count again, not what was typed", async () => {
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setSegments(wrapper, "40");
    expect(mocks.update).not.toHaveBeenCalled();
    expect((wrapper.get('input[aria-label="Clock segments"]').element as HTMLInputElement).value).toBe("6");
  });

  it("a refused rename puts the old name back and says why", async () => {
    mocks.update.mockRejectedValue(new Error("Could not rename"));
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setLabel(wrapper, "The rite");
    expect(mocks.error).toHaveBeenCalledWith("Could not rename");
    expect((wrapper.get('input[aria-label="Clock label"]').element as HTMLInputElement).value).toBe("The ritual");
  });

  it.each([["1"], ["13"], ["abc"]])("segment count %j is outside 2 to 12 and snaps back without saving", async (typed) => {
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setSegments(wrapper, typed);
    expect(mocks.update).not.toHaveBeenCalled();
    expect((wrapper.get('input[aria-label="Clock segments"]').element as HTMLInputElement).value).toBe("6");
  });

  it.each([["2", 2], ["12", 12], ["7.6", 8]])("segment count %j is accepted as %i", async (typed, saved) => {
    mocks.update.mockResolvedValue("q1");
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setSegments(wrapper, typed);
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", questId: "q1", update: { segments: saved } });
  });

  it("re-entering the same segment count saves nothing", async () => {
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    await setSegments(wrapper, "6");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
