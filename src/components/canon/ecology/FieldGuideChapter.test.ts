import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import type { Clade, Species, SpeciesForm } from "@/lib/canon/ecologyTypes";

const mocks = vi.hoisted(() => ({ addSpecies: vi.fn() }));
const state = vi.hoisted(() => ({ species: [] as unknown[], clades: [] as unknown[], forms: [] as unknown[], habitats: [] as unknown[], habitatSpecies: [] as unknown[] }));

vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useSpeciesEditing: () => ({ species: ref(state.species), clades: ref(state.clades), forms: ref(state.forms), ready: ref(true), addSpecies: mocks.addSpecies }),
}));
vi.mock("@/composables/canon/useCampaignHabitats", () => ({ useCampaignHabitats: () => ({ habitats: ref(state.habitats), habitatSpecies: ref(state.habitatSpecies) }) }));
vi.mock("@/composables/canon/useLinkedRow", () => ({ useLinkedRow: vi.fn() }));

import FieldGuideChapter from "./FieldGuideChapter.vue";
import { useCanonUiStore } from "@/stores/ui/canon";

const species = (o: Partial<Species> & { id: string }): Species => ({ name: o.id, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0, ...o });
const clade = (o: Partial<Clade> & { id: string }): Clade => ({ name: o.id, rank: null, parentId: null, description: null, sortOrder: 0, ...o });
const form = (o: Partial<SpeciesForm> & { id: string }): SpeciesForm => ({ speciesId: "s", label: "Adult", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: null, ...o });
const mountIt = () => mount(FieldGuideChapter, { global: { stubs: { SpeciesEditor: { template: "<div data-testid='editor-stub' />" } } } });

describe("FieldGuideChapter", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.addSpecies.mockReset();
    state.species = [
      species({ id: "bear", name: "Rime bear", scientificName: "Ursus glacialis", cladeId: "bears" }),
      species({ id: "fern", name: "Ghost fern", kingdom: "plant" }),
    ];
    state.clades = [clade({ id: "bears", name: "Rubiursus", rank: "genus" })];
    state.forms = [form({ id: "f1", speciesId: "bear" }), form({ id: "f2", speciesId: "bear", domesticated: true })];
    state.habitats = [{ id: "h1", name: "Salt marsh" }];
    state.habitatSpecies = [{ id: "hs1", habitatId: "h1", speciesId: "bear" }];
  });

  // Bug: the species of every kingdom were listed whatever filter was chosen, and Clear did not bring them back.
  it("narrows to the chosen kingdom and Clear shows all again", async () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=species-group-heading]").map((h) => h.text())).toEqual(["Rubiursus · genus", "In no clade"]);
    await w.findAll("button").find((b) => b.text() === "Plants")!.trigger("click");
    expect(w.findAll("[data-testid=species-group-heading]").map((h) => h.text())).toEqual(["In no clade"]);
    expect(useCanonUiStore().fieldGuideKingdom).toBe("plant");
    await w.get("[data-testid=field-guide-clear]").trigger("click");
    expect(w.findAll("[data-testid=species-group-heading]")).toHaveLength(2);
    expect(w.find("[data-testid=field-guide-clear]").exists()).toBe(false);
  });

  // Bug: a row named only the species, hiding the scientific name, the habitats and how many forms it has.
  it("draws a row with its scientific name, its habitats and its forms mark", () => {
    const row = mountIt().get("#canon-species-bear");
    expect(row.get("[data-testid=species-scientific]").text()).toBe("Ursus glacialis");
    expect(row.get("[data-testid=species-habitats]").text()).toBe("Salt marsh");
    expect(row.get("[data-testid=species-mark]").text()).toBe("2 forms, 1 domesticated");
  });

  // Bug: a species added with a name opened nothing, or a failed add cleared the words the DM typed.
  it("opens the species it adds and keeps the words when the add fails", async () => {
    const w = mountIt();
    mocks.addSpecies.mockResolvedValueOnce(null);
    await w.get("input[aria-label='A new species']").setValue("Marsh heron");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(w.find("[data-testid=editor-stub]").exists()).toBe(false);
    expect((w.get("input[aria-label='A new species']").element as HTMLInputElement).value).toBe("Marsh heron");
    mocks.addSpecies.mockResolvedValueOnce("bear");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.addSpecies).toHaveBeenLastCalledWith("Marsh heron");
    expect(w.find("[data-testid=editor-stub]").exists()).toBe(true);
  });
});
