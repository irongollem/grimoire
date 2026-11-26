import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";

const mocks = vi.hoisted(() => ({ update: vi.fn(), addClade: vi.fn() }));
const clades = [
  { id: "ursidae", name: "Ursidae", rank: "family", parentId: null, description: null, sortOrder: 0 },
  { id: "genus", name: "Rubiursus", rank: "genus", parentId: "ursidae", description: null, sortOrder: 0 },
];
vi.mock("@/composables/canon/useCampaignSpecies", () => ({ useSpeciesEditing: () => ({ clades: ref(clades), updateSpecies: mocks.update, addClade: mocks.addClade }) }));

import SpeciesRank from "./SpeciesRank.vue";

const species = { id: "s1", name: "Rime bear", scientificName: null, cladeId: "genus", kingdom: "animal" as const, livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0 };
const mountIt = (over = {}) => mount(SpeciesRank, { props: { species: { ...species, ...over } } });

describe("SpeciesRank", () => {
  beforeEach(() => {
    mocks.update.mockReset().mockResolvedValue(undefined);
    mocks.addClade.mockReset().mockResolvedValue("new-clade");
  });

  it("reads as plain words until clicked: the kingdom, then the clade path from the root down", () => {
    const w = mountIt();
    expect(w.get("[data-testid=species-kingdom]").text()).toBe("Animal");
    expect(w.findAll("[data-testid=species-clade]").map((c) => c.text())).toEqual(["Ursidae", "Rubiursus"]);
    expect(w.find("select").exists()).toBe(false);
    expect(w.findComponent(EntityCombobox).exists()).toBe(false);
  });

  // Bug: choosing the kingdom it already had wrote anyway, or the choice was not saved as the closed value.
  it("saves a new kingdom and nothing for the same one", async () => {
    const w = mountIt();
    await w.get("[data-testid=species-kingdom]").trigger("click");
    await w.get("select[aria-label=Kingdom]").setValue("plant");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("s1", { kingdom: "plant" });
  });

  it("saves another clade", async () => {
    const w = mountIt();
    await w.get("[data-testid=species-clade]").trigger("click");
    await w.findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "ursidae");
    expect(mocks.update).toHaveBeenLastCalledWith("s1", { cladeId: "ursidae" });
  });

  // Bug: "In no clade" saved the empty string as the clade id.
  it("saves In no clade as none", async () => {
    const w = mountIt();
    await w.get("[data-testid=species-clade]").trigger("click");
    await w.findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "__none");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("s1", { cladeId: null });
  });

  // Bug: a new clade was made but the species was not put in it, or its parent was dropped.
  it("makes a new clade inside another and puts the species in it", async () => {
    const w = mountIt({ cladeId: null });
    await w.get("[data-testid=species-clade]").trigger("click");
    await w.findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "__new");
    await w.get("input[aria-label='Name of the new clade']").setValue("Glacialis");
    await w.findAllComponents(EntityCombobox)[1].vm.$emit("update:modelValue", "genus");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.addClade).toHaveBeenCalledExactlyOnceWith("Glacialis", "genus");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("s1", { cladeId: "new-clade" });
  });

  // Bug: a refused clade (a failed write) still moved the species into a clade that does not exist.
  it("leaves the species alone when the clade is refused", async () => {
    mocks.addClade.mockResolvedValue(null);
    const w = mountIt({ cladeId: null });
    await w.get("[data-testid=species-clade]").trigger("click");
    await w.findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "__new");
    await w.get("input[aria-label='Name of the new clade']").setValue("Glacialis");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
