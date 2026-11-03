import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LaneEditor from "./LaneEditor.vue";

const updateLane = vi.fn().mockResolvedValue(undefined);
const pages = ref([{ id: "pg", lanes: [{ name: "Music", rule: "one" }] }]);

vi.mock("@/composables/soundboard/useSoundboardPages", () => ({
  useSoundboardPages: () => ({ data: pages }),
  useUpdatePageLane: () => ({ mutateAsync: updateLane }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  updateLane.mockClear();
});
afterEach(() => vi.useRealTimers());

async function edit(w: ReturnType<typeof mount>, name: string) {
  await w.find("input").setValue(name);
  await vi.advanceTimersByTimeAsync(1000);
  await flushPromises();
}

describe("LaneEditor", () => {
  it("does not save an empty name", async () => {
    // Bug: the database CHECK would reject it and the lane would keep a stale "saved" state.
    const w = mount(LaneEditor, { props: { pageId: "pg", laneIndex: 0 } });
    await edit(w, "  ");
    expect(updateLane).not.toHaveBeenCalled();
  });

  it("does not save a name over 40 characters", async () => {
    const w = mount(LaneEditor, { props: { pageId: "pg", laneIndex: 0 } });
    await edit(w, "x".repeat(41));
    expect(updateLane).not.toHaveBeenCalled();
  });

  it("saves a valid name for the right lane", async () => {
    const w = mount(LaneEditor, { props: { pageId: "pg", laneIndex: 0 } });
    await edit(w, "Battle");
    expect(updateLane).toHaveBeenCalledWith({ pageId: "pg", laneIndex: 0, patch: { name: "Battle", rule: "one" } });
  });

  it("saves the rule", async () => {
    const w = mount(LaneEditor, { props: { pageId: "pg", laneIndex: 0 } });
    const together = w.findAll("button").find((b) => b.text() === "Together");
    await together?.trigger("click");
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();
    expect(updateLane).toHaveBeenCalledWith({ pageId: "pg", laneIndex: 0, patch: { name: "Music", rule: "together" } });
  });
});
