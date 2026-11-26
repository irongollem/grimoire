import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed } from "vue";
import MentionTextarea from "@/components/common/controls/MentionTextarea.vue";

const mocks = vi.hoisted(() => ({ addSpecies: vi.fn(), setAbundance: vi.fn(), removeSpecies: vi.fn(), setFormPercent: vi.fn(), setOther: vi.fn() }));
const state = vi.hoisted(() => ({ life: [] as unknown[], other: null as number | null }));

const kind = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, scientificName: null, cladeId: null, kingdom: "animal", livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0, ...over,
});
vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useHabitatEditing: () => ({
    habitatSpecies: computed(() => [
      { id: "hs-eel", habitatId: "h1", speciesId: "eel", abundance: "common", sortOrder: 0 },
      { id: "hs-frog", habitatId: "h1", speciesId: "frog", abundance: null, sortOrder: 1 },
    ]),
    life: computed(() => state.life),
    addHabitatSpecies: mocks.addSpecies,
    setAbundance: mocks.setAbundance,
    removeHabitatSpecies: mocks.removeSpecies,
    setFormPercent: mocks.setFormPercent,
    setOtherPercent: mocks.setOther,
  }),
}));
vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useCampaignSpecies: () => ({
    species: computed(() => [kind("eel", "Marsh eel", { scientificName: "Anguilla salina" }), kind("frog", "Giant frog"), kind("newt", "Fire newt")]),
    forms: computed(() => [
      { id: "fe1", speciesId: "eel", label: "Young", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: "mon_young" },
      { id: "fe2", speciesId: "eel", label: "Adult", stageOrder: 1, domesticated: false, monsterId: null, libraryMonsterId: "mon_adult" },
      { id: "ff", speciesId: "frog", label: "Adult", stageOrder: 0, domesticated: false, monsterId: null, libraryMonsterId: "mon_frog" },
    ]),
  }),
}));
vi.mock("@/composables/monsters/useMonstersByIds", () => ({ useMonstersByIds: () => ({ data: computed(() => new Map([["mon_adult", { image_url: "https://cdn.test/eel.webp" }]])) }) }));
vi.mock("@/components/tiptap/EntityMentionChip.vue", () => ({ default: { props: ["id"], template: "<span data-testid='chip'>{{ id }}</span>" } }));
vi.mock("@/components/common/media/FocalImage.vue", () => ({ default: { props: ["src"], template: "<img data-testid='picture' :src='src' />" } }));

import HabitatLife from "./HabitatLife.vue";

const habitat = () => ({ id: "h1", name: "Salt marsh", description: null, sortOrder: 0, otherPercent: state.other });
const row = (formId: string, speciesId: string, percent: number | null, over: Record<string, unknown> = {}) => ({
  id: `l-${formId}`, habitatId: "h1", speciesId, formId, percent, sortOrder: 0, recordId: `mon_${formId}`, fromLibrary: true, name: formId, readable: true, speciesName: speciesId, formLabel: "Adult", ...over,
});
const stubs = { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } };
const mountIt = () => mount(HabitatLife, { props: { habitat: habitat() }, global: { stubs } });
const field = (w: ReturnType<typeof mountIt>, label: string) => w.get(`input[aria-label="${label}"]`);

async function type(w: ReturnType<typeof mountIt>, label: string, value: string) {
  const input = field(w, label);
  (input.element as HTMLInputElement).value = value;
  await input.trigger("change");
  await flushPromises();
}

describe("HabitatLife", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    state.other = null;
    state.life = [row("fe1", "eel", 5, { formLabel: "Young" }), row("fe2", "eel", 20, { formLabel: "Adult" }), row("ff", "frog", null)];
  });

  // Bug: the share box showed the worked-out number as if the DM had typed it, so it was saved on the next edit.
  it("shows the worked-out share as a placeholder and only the DM's own number as the value", () => {
    state.life = [row("ff", "frog", null)];
    const w = mountIt();
    const input = field(w, "Share of Giant frog, percent").element as HTMLInputElement;
    expect(input.value).toBe("");
    // The eel has no form on the roll here, so the frog takes 100 less the default 10 for anything else.
    expect(input.placeholder).toBe("90");
    state.life = [row("ff", "frog", 35)];
    expect((field(mountIt(), "Share of Giant frog, percent").element as HTMLInputElement).value).toBe("35");
  });

  // Bug: clearing a typed share left it at the old number (or saved 0) instead of going back to worked out.
  it("saves a typed share, and a cleared one as null", async () => {
    state.life = [row("ff", "frog", 35)];
    const w = mountIt();
    await type(w, "Share of Giant frog, percent", "40");
    expect(mocks.setFormPercent).toHaveBeenLastCalledWith("l-ff", 40);
    await type(w, "Share of Giant frog, percent", "");
    expect(mocks.setFormPercent).toHaveBeenLastCalledWith("l-ff", null);
  });

  // Bug: a habitat past 100% was sent and the database refused it at commit instead of the screen saying so first.
  it("says shares past 100 and does not save them", async () => {
    const w = mountIt();
    // The eel's forms hold 5 and 20 typed, so 76 for the frog makes 101.
    await type(w, "Share of Giant frog, percent", "76");
    expect(w.get("[role=alert]").text()).toContain("101%");
    expect(mocks.setFormPercent).not.toHaveBeenCalled();
    await type(w, "Share of Giant frog, percent", "75");
    expect(mocks.setFormPercent).toHaveBeenCalledWith("l-ff", 75);
    expect(w.find("[role=alert]").exists()).toBe(false);
    expect(w.get("[data-testid=share-total]").text()).toBe("Adds up to 100%.");
  });

  // Bug: a species with several forms offered one box that wrote to a single form, or summed only the typed ones.
  it("shows the sum of a species' forms read-only and a field for each form under it", async () => {
    const w = mountIt();
    const eel = w.findAll("[data-testid=habitat-species]")[0];
    expect(eel.find("input[aria-label='Share of Marsh eel, percent']").exists()).toBe(false);
    expect(eel.get("[data-testid=species-total]").text()).toContain("25");
    expect(eel.findAll("[data-testid=chip]").map((c) => c.text())).toEqual(["mon_fe1", "mon_fe2"]);
    await type(w, "Share of Marsh eel, Young, percent", "15");
    expect(mocks.setFormPercent).toHaveBeenCalledWith("l-fe1", 15);
  });

  // Bug: the picture came from the wrong form, or an image-less species drew a broken picture instead of its initial.
  it("draws the picture of the form met most often, else the species' initial", () => {
    const w = mountIt();
    const [eel, frog] = w.findAll("[data-testid=habitat-species]");
    expect(eel.get("[data-testid=picture]").attributes("src")).toBe("https://cdn.test/eel.webp");
    expect(frog.find("[data-testid=picture]").exists()).toBe(false);
    expect(frog.text()).toContain("G");
  });

  it("saves how common a species is, and unset as null", async () => {
    const w = mountIt();
    await w.get("select[aria-label='How common Giant frog is here']").setValue("rare");
    expect(mocks.setAbundance).toHaveBeenLastCalledWith("hs-frog", "rare");
    const eel = w.get("select[aria-label='How common Marsh eel is here']");
    (eel.element as HTMLSelectElement).selectedIndex = 0;
    await eel.trigger("change");
    expect(mocks.setAbundance).toHaveBeenLastCalledWith("hs-eel", null);
  });

  it("types the share of anything else, and clearing it leaves it to the default", async () => {
    const w = mountIt();
    expect((field(w, "Share of anything else, percent").element as HTMLInputElement).placeholder).toBe("10");
    await type(w, "Share of anything else, percent", "25");
    expect(mocks.setOther).toHaveBeenLastCalledWith("h1", 25);
    await type(w, "Share of anything else, percent", "");
    expect(mocks.setOther).toHaveBeenLastCalledWith("h1", null);
  });

  // Bug: removing a species removed the wrong row, or the add picker offered a species already living here.
  it("removes the species whose button was pressed and offers only species not yet here", async () => {
    const w = mountIt();
    await w.get("button[aria-label='Remove Giant frog']").trigger("click");
    expect(mocks.removeSpecies).toHaveBeenCalledExactlyOnceWith("hs-frog");
    expect(w.getComponent(MentionTextarea).props("items")).toEqual([{ id: "newt", label: "Fire newt", entityType: "species" }]);
  });

  it("adds the species picked with an @ and empties the box", async () => {
    const w = mountIt();
    const picker = w.getComponent(MentionTextarea);
    picker.vm.$emit("update:modelValue", "@fire");
    picker.vm.$emit("item-selected", { item: { id: "newt", label: "Fire newt" }, token: "@Fire", value: "@Fire " });
    await flushPromises();
    expect(mocks.addSpecies).toHaveBeenCalledExactlyOnceWith("h1", "newt");
    expect(picker.props("modelValue")).toBe("");
  });
});
