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
    const input = await setSegments(wrapper, "3");
    expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("cannot be shortened"));
    expect((input.element as HTMLInputElement).value).toBe("6");
  });
});
