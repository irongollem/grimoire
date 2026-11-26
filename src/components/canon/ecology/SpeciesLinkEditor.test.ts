import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ updateLink: vi.fn() }));
const sp = (id: string, name: string) => ({ id, name, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0 });
const form = (id: string, speciesId: string, label: string, stageOrder: number) => ({ id, speciesId, label, stageOrder, domesticated: false, monsterId: null, libraryMonsterId: null });

vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useSpeciesEditing: () => ({
    species: ref([sp("bear", "Rime bear"), sp("piper", "Pith piper")]),
    forms: ref([form("bear-young", "bear", "Young", 0), form("piper-old", "piper", "Old", 0)]),
    updateLink: mocks.updateLink,
  }),
}));
vi.mock("@/composables/canon/useCampaignHabitats", () => ({ useCampaignHabitats: () => ({ habitats: ref([{ id: "h1", name: "Salt marsh" }]) }) }));

import SpeciesLinkEditor from "./SpeciesLinkEditor.vue";

const link = { id: "l1", fromSpeciesId: "piper", kind: "eats" as const, toSpeciesId: "bear", fromFormId: null, toFormId: null, habitatId: null, note: "in autumn" };
const mountFor = (speciesId: string) => mount(SpeciesLinkEditor, { props: { link, species: sp(speciesId, speciesId) as never } });

describe("SpeciesLinkEditor", () => {
  beforeEach(() => {
    mocks.updateLink.mockReset().mockResolvedValue(undefined);
  });

  // Bug: the age picked for "this species" was written to the link's from side whichever way the link was written.
  it("writes the open species' age to the column that species is in", async () => {
    // The link is piper eats bear. Open on the bear (the "to" side), its age is toFormId.
    await mountFor("bear").get("select[aria-label='Age of bear']").setValue("bear-young");
    expect(mocks.updateLink).toHaveBeenLastCalledWith("l1", { toFormId: "bear-young" });
    // Open on the piper (the "from" side), its age is fromFormId.
    await mountFor("piper").get("select[aria-label='Age of piper']").setValue("piper-old");
    expect(mocks.updateLink).toHaveBeenLastCalledWith("l1", { fromFormId: "piper-old" });
  });

  // Bug: "Wherever they meet" saved the empty string as a habitat id (a foreign key the database refuses).
  it("saves a habitat, and Wherever they meet as none", async () => {
    await mountFor("bear").get("select[aria-label='Where it happens']").setValue("h1");
    expect(mocks.updateLink).toHaveBeenLastCalledWith("l1", { habitatId: "h1" });
  });

  // Bug: clearing the note wrote an empty string, and an untouched blur rewrote the same note.
  it("saves a cleared note as no note and a changed one trimmed", async () => {
    const w = mountFor("bear");
    const input = w.get("input[aria-label='A note on this link']");
    await input.setValue("in winter  ");
    await input.trigger("change");
    await flushPromises();
    expect(mocks.updateLink).toHaveBeenLastCalledWith("l1", { note: "in winter" });
    await input.setValue("");
    await input.trigger("change");
    await flushPromises();
    expect(mocks.updateLink).toHaveBeenLastCalledWith("l1", { note: null });
  });
});
