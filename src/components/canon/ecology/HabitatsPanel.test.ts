import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed } from "vue";

const mocks = vi.hoisted(() => ({ add: vi.fn(), reorder: vi.fn() }));

vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useHabitatEditing: () => ({
    habitats: computed(() => [
      { id: "a", name: "Salt marsh", description: null, sortOrder: 0 },
      { id: "b", name: "High moor", description: null, sortOrder: 1 },
      { id: "c", name: "Barrens", description: null, sortOrder: 2 },
    ]),
    places: computed(() => [{ id: "p1", habitatId: "a", locationId: "l1" }]),
    life: computed(() => [
      { id: "x", habitatId: "a", name: "Marsh eel", percent: 40, readable: true },
      { id: "y", habitatId: "a", name: "Giant frog", percent: 20, readable: true },
      { id: "z", habitatId: "b", name: "Goat", percent: 10, readable: true },
    ]),
    isLoading: computed(() => false),
    addHabitat: mocks.add,
    reorderHabitats: mocks.reorder,
  }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: computed(() => [{ id: "l1", name: "The Marsh", depth: 0 }]) }),
}));
vi.mock("./HabitatEditor.vue", () => ({ default: { props: ["habitat"], template: "<div data-testid='editor'>{{ habitat.name }}</div>" } }));

import HabitatsPanel from "./HabitatsPanel.vue";

describe("HabitatsPanel", () => {
  beforeEach(() => {
    mocks.add.mockReset();
    mocks.reorder.mockReset();
  });

  // Bug: a habitat's line showed another habitat's creatures, or left out its places.
  it("gives each habitat its places and its own creatures at their shares, the rest as anything else", () => {
    const w = mount(HabitatsPanel);
    const rows = w.findAll("li");
    expect(rows[0].find("[data-testid=habitat-place]").text()).toBe("The Marsh");
    expect(rows[0].get("[data-testid=habitat-summary]").text()).toBe("Marsh eel 40%, Giant frog 20%, anything else 40%");
    expect(rows[1].get("[data-testid=habitat-summary]").text()).toBe("Goat 10%, anything else 90%");
    expect(rows[2].text()).toContain("Nothing lives here yet.");
  });

  // Bug: moving a habitat down moved it up, or the first row could still be moved up past the top.
  it("moves a habitat one place and offers no move past either end", async () => {
    const w = mount(HabitatsPanel);
    await w.find("button[aria-label='Move Salt marsh down']").trigger("click");
    expect(mocks.reorder).toHaveBeenCalledExactlyOnceWith(["b", "a", "c"]);
    expect(w.find("button[aria-label='Move Salt marsh up']").attributes("disabled")).toBeDefined();
    expect(w.find("button[aria-label='Move Barrens down']").attributes("disabled")).toBeDefined();
  });

  it("moves a habitat up as well as down", async () => {
    const w = mount(HabitatsPanel);
    await w.find("button[aria-label='Move Barrens up']").trigger("click");
    expect(mocks.reorder).toHaveBeenCalledExactlyOnceWith(["a", "c", "b"]);
  });

  it("opens the editor on a new habitat once it is added, and on none until then", async () => {
    mocks.add.mockResolvedValue("c");
    const w = mount(HabitatsPanel);
    expect(w.find("[data-testid=editor]").exists()).toBe(false);
    await w.find("input[aria-label='A new kind of country']").setValue("Barrens");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.get("[data-testid=editor]").text()).toBe("Barrens");
  });

  // Bug: a failed add (already a toast) cleared the words and opened the editor on nothing.
  it("keeps the words in the box and opens nothing when the add failed", async () => {
    mocks.add.mockResolvedValue(null);
    const w = mount(HabitatsPanel);
    await w.find("input[aria-label='A new kind of country']").setValue("Barrens");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.find("[data-testid=editor]").exists()).toBe(false);
    expect((w.find("input[aria-label='A new kind of country']").element as HTMLInputElement).value).toBe("Barrens");
  });
});
