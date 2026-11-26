import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed } from "vue";

const mocks = vi.hoisted(() => ({ add: vi.fn(), reorder: vi.fn() }));
const state = vi.hoisted(() => ({ none: false }));

// The chapter reads its deep link (`?habitat=`) from the route; each test sets the query it was reached with.
const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));
vi.mock("vue-router", async (orig) => ({ ...(await orig<typeof import("vue-router")>()), useRoute: () => routeState }));

vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useHabitatEditing: () => ({
    habitats: computed(() => state.none ? [] : [
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
vi.mock("./HabitatEditor.vue", () => ({
  default: { props: ["habitat"], emits: ["close", "delete"], template: "<div data-testid='editor'>{{ habitat.name }}<button data-testid='editor-close' @click=\"$emit('close')\" /></div>" },
}));
vi.mock("@/composables/ask/useCanAsk", async () => {
  const { ref: r } = await import("vue");
  return { useCanAsk: () => r(true) };
});

import LifeChapter from "./LifeChapter.vue";

describe("LifeChapter", () => {
  beforeEach(() => {
    routeState.query = {};
    mocks.add.mockReset();
    mocks.reorder.mockReset();
    state.none = false;
  });

  // Bug: a search hit for a habitat (`?habitat=`) landed on the chapter with nothing open; an id that is no habitat must open nothing.
  it("opens the habitat a search link names, and nothing for an unknown id", async () => {
    routeState.query = { habitat: "b" };
    const w = mount(LifeChapter);
    await flushPromises();
    expect(w.get("[data-testid=editor]").text()).toContain("High moor");
    routeState.query = { habitat: "nope" };
    const none = mount(LifeChapter);
    await flushPromises();
    expect(none.find("[data-testid=editor]").exists()).toBe(false);
  });

  // Bug caught (#1279 item 10): "Ask the Familiar" on an empty habitat list, for which the canon helper has no mode and which came back as truths.
  it("offers no Familiar request in the empty state", () => {
    state.none = true;
    const w = mount(LifeChapter);
    expect(w.text()).toContain("Nothing lives here yet");
    expect(w.find("[data-testid=canon-suggest]").exists()).toBe(false);
  });

  // Bug: a habitat's line showed another habitat's creatures, or left out its places.
  it("gives each habitat its places and its own creatures at their shares, the rest as anything else", () => {
    const w = mount(LifeChapter);
    const rows = w.findAll("li");
    expect(rows[0].find("[data-testid=habitat-place]").text()).toBe("The Marsh");
    expect(rows[0].get("[data-testid=habitat-summary]").text()).toBe("Marsh eel 40%, Giant frog 20%, anything else 40%");
    expect(rows[1].get("[data-testid=habitat-summary]").text()).toBe("Goat 10%, anything else 90%");
    expect(rows[2].text()).toContain("Nothing lives here yet.");
  });

  // Bug: moving a habitat down moved it up, or the first row could still be moved up past the top.
  it("moves a habitat one place and offers no move past either end", async () => {
    const w = mount(LifeChapter);
    await w.find("button[aria-label='Move Salt marsh down']").trigger("click");
    expect(mocks.reorder).toHaveBeenCalledExactlyOnceWith(["b", "a", "c"]);
    expect(w.find("button[aria-label='Move Salt marsh up']").attributes("disabled")).toBeDefined();
    expect(w.find("button[aria-label='Move Barrens down']").attributes("disabled")).toBeDefined();
  });

  it("moves a habitat up as well as down", async () => {
    const w = mount(LifeChapter);
    await w.find("button[aria-label='Move Barrens up']").trigger("click");
    expect(mocks.reorder).toHaveBeenCalledExactlyOnceWith(["a", "c", "b"]);
  });

  it("opens the editor on a new habitat once it is added, and on none until then", async () => {
    mocks.add.mockResolvedValue("c");
    const w = mount(LifeChapter);
    expect(w.find("[data-testid=editor]").exists()).toBe(false);
    await w.find("input[aria-label='A new kind of country']").setValue("Barrens");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.get("[data-testid=editor]").text()).toBe("Barrens");
  });

  // Bug: closing the entry left the list hidden on a phone, so the DM could not get back to the habitats.
  it("closes the open habitat from the entry, and opens one by tapping its row", async () => {
    const w = mount(LifeChapter);
    await w.find("button[aria-label='High moor']").trigger("click");
    expect(w.get("[data-testid=editor]").text()).toBe("High moor");
    await w.get("[data-testid=editor-close]").trigger("click");
    expect(w.find("[data-testid=editor]").exists()).toBe(false);
  });

  // Bug: a failed add (already a toast) cleared the words and opened the editor on nothing.
  it("keeps the words in the box and opens nothing when the add failed", async () => {
    mocks.add.mockResolvedValue(null);
    const w = mount(LifeChapter);
    await w.find("input[aria-label='A new kind of country']").setValue("Barrens");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(w.find("[data-testid=editor]").exists()).toBe(false);
    expect((w.find("input[aria-label='A new kind of country']").element as HTMLInputElement).value).toBe("Barrens");
  });
});
