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

import SpeciesNotes from "./SpeciesNotes.vue";

const species = { id: "s1", name: "Rime bear", scientificName: null, cladeId: null, kingdom: "animal" as const, livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0 };
const links = { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } };

describe("SpeciesNotes", () => {
  beforeEach(() => {
    mocks.create.mockReset().mockResolvedValue(canonEntry());
    state.entries = [
      canonEntry({ id: "t1", title: "Sleeps through the thaw", knowledge: "all", species_id: "s1" }),
      canonEntry({ id: "t2", title: "Another species' truth", knowledge: "all", species_id: "s2" }),
      canonEntry({ id: "t3", title: "A habitat's truth", knowledge: "all", habitat_id: "h1" }),
    ];
  });

  // Bug: every truth, or a habitat's truths, were listed under the species.
  it("lists only the truths of this species, each linking to its entry", () => {
    const notes = mount(SpeciesNotes, { props: { species }, global: { stubs: links } }).findAll("[data-testid=species-note]");
    expect(notes).toHaveLength(1);
    expect(notes[0].get("a").attributes("href")).toBe("/canon?entry=t1");
  });

  // Bug: a note was made as a plain truth that belonged to no species, so the field guide never listed it.
  it("adds a note as a truth known to all that belongs to this species", async () => {
    const w = mount(SpeciesNotes, { props: { species }, global: { stubs: links } });
    await w.get("input[aria-label='A note on this species']").setValue("Fears fire");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ part: "truth", knowledge: "all", title: "Fears fire", species_id: "s1", sort_order: 1 });
  });
});
