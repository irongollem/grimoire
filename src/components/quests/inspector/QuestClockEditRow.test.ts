import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestClockEditRow from "./QuestClockEditRow.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import type { QuestClock } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), error: vi.fn() }));
const entries = vi.hoisted(() => ({ list: [] as Array<{ id: string; part: string; title: string; closed_as: string | null }> }));

vi.mock("@/composables/quests/useQuestClocks", () => ({
  useUpdateQuestClock: () => ({ mutateAsync: mocks.update }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: { value: entries.list } }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: mocks.error, fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }),
}));

const clock = { id: "c1", label: "The ritual", segments: 6, filled: 3, moves_force_id: null } as QuestClock;

describe("QuestClockEditRow", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    mocks.error.mockReset();
    entries.list = [
      { id: "f1", part: "force", title: "The Stain", closed_as: null },
      { id: "f2", part: "force", title: "The Gone Guild", closed_as: "faded" },
      { id: "s1", part: "secret", title: "A secret", closed_as: null },
      { id: "t1", part: "truth", title: "A truth", closed_as: null },
    ];
  });

  const picker = (wrapper: ReturnType<typeof mount>) => wrapper.getComponent(EntityCombobox);
  const optionIds = (wrapper: ReturnType<typeof mount>) => ((picker(wrapper).props() as { options: Array<{ id: string }> }).options).map((o) => o.id);

  // Bug caught (#1255 item 20): the picker offered secrets, truths or an ended force, which the database refuses or which move nothing.
  it("offers only forces still moving, and the one already set even if it has ended", () => {
    expect(optionIds(mount(QuestClockEditRow, { props: { clock, questId: "q1" } }))).toEqual(["f1"]);
    const tied = { ...clock, moves_force_id: "f2" } as QuestClock;
    expect(optionIds(mount(QuestClockEditRow, { props: { clock: tied, questId: "q1" } })).sort()).toEqual(["f1", "f2"]);
  });

  // Bug caught: choosing a force changed the picker but never saved the tie.
  it("choosing a force saves moves_force_id, and clearing it saves null", async () => {
    mocks.update.mockResolvedValue("q1");
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    picker(wrapper).vm.$emit("update:modelValue", "f1");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", questId: "q1", update: { moves_force_id: "f1" } });
    mocks.update.mockClear();
    const tied = mount(QuestClockEditRow, { props: { clock: { ...clock, moves_force_id: "f1" } as QuestClock, questId: "q1" } });
    picker(tied).vm.$emit("update:modelValue", "");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "c1", questId: "q1", update: { moves_force_id: null } });
  });

  // Bug caught: a clock with no force was "cleared" to null on every mount-time emit, writing for nothing.
  it("saves nothing when the force is unchanged", async () => {
    const wrapper = mount(QuestClockEditRow, { props: { clock, questId: "q1" } });
    picker(wrapper).vm.$emit("update:modelValue", "");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
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
