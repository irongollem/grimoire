import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunClocks from "./QuestRunClocks.vue";

const RouterLink = { props: ["to"], template: "<a :href=\"to\"><slot /></a>" };
const mountIt = () => mount(QuestRunClocks, { props: { questId: "q1" }, global: { stubs: { RouterLink } } });

const mocks = vi.hoisted(() => ({
  clocks: [] as Array<{ id: string; label: string; segments: number; filled: number; moves_force_id?: string | null }>,
  canonWrite: vi.fn(),
  tick: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/composables/quests/useQuestClocks", () => ({
  useQuestClocks: () => ({ data: ref(mocks.clocks) }),
  useTickQuestClock: () => ({ mutateAsync: mocks.tick, isPending: ref(false) }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data: ref([{ id: "f1", part: "force", title: "The Stain" }]) }),
}));
vi.mock("@/composables/canon/useCanonForces", () => ({ useTickForce: () => ({ mutate: mocks.canonWrite, mutateAsync: mocks.canonWrite }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error, fromError: String }),
}));

describe("QuestRunClocks", () => {
  beforeEach(() => {
    mocks.clocks = [{ id: "c1", label: "The ritual", segments: 4, filled: 3 }];
    mocks.tick.mockReset();
    mocks.success.mockReset();
    mocks.error.mockReset();
  });

  // Bug caught (#1255 item 20): a clock that moves a force gave no hint at the table, or linked to the wrong entry.
  it("a clock that moves a force names it and links to it; one that moves none shows no line", () => {
    mocks.clocks = [
      { id: "c1", label: "The ritual", segments: 4, filled: 3, moves_force_id: "f1" },
      { id: "c2", label: "The siege", segments: 4, filled: 0, moves_force_id: null },
    ];
    const w = mountIt();
    expect(w.findAll("a")).toHaveLength(1);
    expect(w.get("a").text()).toBe("Moves The Stain");
    expect(w.get("a").attributes("href")).toBe("/canon?entry=f1");
  });

  // Bug caught: the client also wrote the force's tick, so the force moved twice (the database trigger already writes it).
  it("ticking a clock that moves a force writes no canon tick from the client", async () => {
    mocks.clocks = [{ id: "c1", label: "The ritual", segments: 4, filled: 1, moves_force_id: "f1" }];
    mocks.tick.mockResolvedValue({ changed: true, filled: 2, segments: 4, filled_up: false });
    const w = mountIt();
    await w.get('button[aria-label="Tick The ritual"]').trigger("click");
    await flushPromises();
    expect(mocks.tick).toHaveBeenCalledTimes(1);
    expect(mocks.canonWrite).not.toHaveBeenCalled();
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

  it("a refused tick is toasted and the clock is left as it was", async () => {
    mocks.tick.mockRejectedValue(new Error("Clock is locked"));
    const wrapper = mount(QuestRunClocks, { props: { questId: "q1" } });
    await wrapper.get('button[aria-label="Tick The ritual"]').trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Error: Clock is locked");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("3 of 4");
  });
});
