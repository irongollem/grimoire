import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

const sp = (id: string) => ({ id, name: id, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0 });
vi.mock("@/composables/canon/useCampaignSpecies", () => ({ useCampaignSpecies: () => ({ species: ref([sp("wolf"), sp("heron")]) }) }));
vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useCampaignHabitats: () => ({
    habitats: ref([{ id: "marsh", name: "Salt marsh", description: null, sortOrder: 0, otherPercent: 0 }, { id: "ice", name: "High ice", description: null, sortOrder: 1, otherPercent: 0 }]),
    habitatSpecies: ref([{ id: "a", habitatId: "marsh", speciesId: "wolf", abundance: "common", sortOrder: 0 }, { id: "b", habitatId: "marsh", speciesId: "heron", abundance: "common", sortOrder: 1 }]),
    life: ref([
      { id: "l1", habitatId: "marsh", speciesId: "wolf", formId: "w", percent: 25, sortOrder: 0, recordId: null, fromLibrary: false, name: null, speciesName: "wolf", formLabel: "Adult" },
      { id: "l2", habitatId: "marsh", speciesId: "heron", formId: "h", percent: 75, sortOrder: 1, recordId: null, fromLibrary: false, name: null, speciesName: "heron", formLabel: "Adult" },
    ]),
  }),
}));

import SpeciesHabitats from "./SpeciesHabitats.vue";

const species = (id: string) => sp(id) as never;

describe("SpeciesHabitats", () => {
  // Bug: the share shown was the habitat's whole roll or another species' share, and a button led to the wrong habitat.
  it("shows a button to each habitat the species lives in, with its own share of the roll", () => {
    const w = mount(SpeciesHabitats, { props: { species: species("wolf") }, global: { stubs: { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } } } });
    const buttons = w.findAll("[data-testid=species-habitat]");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].attributes("href")).toBe("/canon/life?habitat=marsh");
    expect(w.get("[data-testid=species-habitat-share]").text()).toBe("met on a roll 25%");
  });

  it("says where to add a species that lives nowhere yet", () => {
    const w = mount(SpeciesHabitats, { props: { species: species("fern") } });
    expect(w.find("[data-testid=species-habitats]").exists()).toBe(false);
    expect(w.get("[data-testid=species-habitats-none]").text()).toContain("Habitats");
  });
});
