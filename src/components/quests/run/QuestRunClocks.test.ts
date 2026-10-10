import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunClocks from "./QuestRunClocks.vue";

const mocks = vi.hoisted(() => ({
  clocks: [] as Array<{ id: string; label: string; segments: number; filled: number }>,
  tick: vi.fn(),
  success: vi.fn(),
}));

vi.mock("@/composables/quests/useQuestClocks", () => ({
  useQuestClocks: () => ({ data: ref(mocks.clocks) }),
  useTickQuestClock: () => ({ mutateAsync: mocks.tick, isPending: ref(false) }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: vi.fn(), fromError: String }),
}));

describe("QuestRunClocks", () => {
  beforeEach(() => {
    mocks.clocks = [{ id: "c1", label: "The ritual", segments: 4, filled: 3 }];
    mocks.tick.mockReset();
    mocks.success.mockReset();
  });

  it("renders nothing for a quest without clocks", () => {
    mocks.clocks = [];
    expect(mount(QuestRunClocks, { props: { questId: "q1" } }).text()).toBe("");
  });

  it("shows the fill and ticks forward, toasting when the clock fills", async () => {
    mocks.tick.mockResolvedValue({ changed: true, filled: 4, segments: 4, filled_up: true });
    const wrapper = mount(QuestRunClocks, { props: { questId: "q1" } });
    expect(wrapper.text()).toContain("3 of 4");
    await wrapper.get('button[aria-label="Tick The ritual"]').trigger("click");
    await flushPromises();
    expect(mocks.tick).toHaveBeenCalledWith({ clockId: "c1", questId: "q1", step: 1 });
    expect(mocks.success).toHaveBeenCalledWith(expect.stringContaining("The ritual filled"));
  });

  it("unticks with a negative step and says nothing special", async () => {
    mocks.tick.mockResolvedValue({ changed: true, filled: 2, segments: 4, filled_up: false });
    const wrapper = mount(QuestRunClocks, { props: { questId: "q1" } });
    await wrapper.get('button[aria-label="Untick The ritual"]').trigger("click");
    await flushPromises();
    expect(mocks.tick).toHaveBeenCalledWith({ clockId: "c1", questId: "q1", step: -1 });
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
