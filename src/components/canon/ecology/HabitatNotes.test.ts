import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
const state = vi.hoisted(() => ({ entries: [] as unknown[] }));

vi.mock("@/composables/canon/useCanonEntries", () => ({
  useCanonEntries: () => ({ data: ref(state.entries) }),
  useCreateCanonEntry: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
}));

import HabitatNotes from "./HabitatNotes.vue";

const habitat = { id: "h1", name: "Salt marsh", description: null, sortOrder: 0 };
const links = { RouterLink: { props: ["to"], template: "<a :href='to.path + \"?entry=\" + to.query.entry'><slot /></a>" } };

describe("HabitatNotes", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.create.mockResolvedValue(canonEntry());
    state.entries = [
      canonEntry({ id: "t1", title: "No wolves south of the river", knowledge: "all", habitat_id: "h1" }),
      canonEntry({ id: "t2", title: "A drowned bell", knowledge: "all", habitat_id: "h2" }),
      canonEntry({ id: "t3", title: "A truth with no habitat", knowledge: "all", habitat_id: null }),
    ];
  });

  // Bug: every truth was listed under every habitat, or the habitat's notes were not linked to where they open.
  it("lists only the truths of this habitat, each linking to its entry", () => {
    const w = mount(HabitatNotes, { props: { habitat }, global: { stubs: links } });
    const notes = w.findAll("[data-testid=habitat-note]");
    expect(notes).toHaveLength(1);
    expect(notes[0].find("a").attributes("href")).toBe("/canon?entry=t1");
  });

  // Bug: a note was made as a plain truth, so it was in Truths but belonged to no habitat, and the world block never knew it.
  it("adds a note as a truth known to all that belongs to this habitat", async () => {
    const w = mount(HabitatNotes, { props: { habitat }, global: { stubs: links } });
    await w.find("input[aria-label='A note on the living world']").setValue("  Fog by night  ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ part: "truth", knowledge: "all", title: "Fog by night", habitat_id: "h1", sort_order: 1 });
  });
});
