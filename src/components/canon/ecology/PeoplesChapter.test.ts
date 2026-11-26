import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia } from "pinia";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";

const mocks = vi.hoisted(() => ({ add: vi.fn(), setPercent: vi.fn(), remove: vi.fn(), saveBody: vi.fn(), rename: vi.fn(), addPlace: vi.fn(), removePlace: vi.fn() }));
const state = vi.hoisted(() => ({ loading: false, peoples: [] as unknown[], places: [] as unknown[], monsterEnabled: (() => false) as () => boolean }));

// The chapter reads its deep link (`?people=`) from the route; each test sets the query it was reached with.
const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));
vi.mock("vue-router", async (orig) => ({ ...(await orig<typeof import("vue-router")>()), useRoute: () => routeState }));

vi.mock("@/composables/canon/useCampaignPeoples", async () => {
  const { computed } = await import("vue");
  return {
    usePeoplesEditing: () => ({
      peoples: computed(() => state.peoples),
      isLoading: computed(() => state.loading),
      addPeople: mocks.add,
      setPercent: mocks.setPercent,
      removePeople: mocks.remove,
      saveBody: mocks.saveBody,
      renamePeople: mocks.rename,
      places: computed(() => state.places),
      addPlace: mocks.addPlace,
      removePlace: mocks.removePlace,
    }),
  };
});
vi.mock("@/composables/locations/useLocations", async () => {
  const { computed } = await import("vue");
  return { useLocationTree: () => ({ locationOptions: computed(() => []) }) };
});
vi.mock("@/composables/notes/useEntityMentionItems", () => ({ useEntityMentionItems: () => ({ mentionItems: ref([]) }) }));
vi.mock("@/composables/ask/useCanAsk", async () => {
  const { ref: r } = await import("vue");
  return { useCanAsk: () => r(true) };
});
vi.mock("@/composables/rules/useSpecies", () => ({
  useCampaignSpecies: () => ({ data: ref([{ id: "srd_elf", name: "Elf" }, { id: "0f8fad5b-d9cb-469f-a165-70867728950e", name: "Gnoll Kin" }]) }),
}));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({
  useMonsterIndex: (options: () => { enabled?: boolean }) => {
    state.monsterEnabled = () => options().enabled === true;
    return { data: ref([{ id: "srd_owlbear", name: "Owlbear", is_shared: true }, { id: "9c2e0000-0000-4000-8000-000000000000", name: "Marsh Hag", is_shared: false }]) };
  },
}));

import PeoplesChapter from "./PeoplesChapter.vue";

// EntityCombobox is generic, so its props are not typed through the wrapper: read them as the shape the picker is given.
const optionsOf = (picker: { props: () => unknown }) => (picker.props() as { options: { name: string }[] }).options;

const people = (id: string, name: string, percent: number, over: Record<string, unknown> = {}) => ({
  id, name, percent, kind: "species", recordId: `r-${id}`, fromLibrary: true, readable: true, body: null, ownName: null, recordName: name, ...over,
});

const links = { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } };
const stubs = { ...links, RichTextEditor: { props: ["modelValue"], template: "<div data-testid='rich-body' />" } };
const mountIt = () => mount(PeoplesChapter, { global: { plugins: [createPinia()], stubs, directives: { "no-pwm": {} } } });

const open = async (w: ReturnType<typeof mount>, id: string) => {
  await w.find(`#canon-people-${id} button`).trigger("click");
  await flushPromises();
};

async function setField(w: ReturnType<typeof mount>, label: string, value: string) {
  const input = w.find(`input[aria-label="${label}"]`);
  (input.element as HTMLInputElement).value = value;
  await input.trigger("change");
  await flushPromises();
}

describe("PeoplesChapter", () => {
  beforeEach(() => {
    routeState.query = {};
    mocks.add.mockReset();
    mocks.setPercent.mockReset();
    mocks.remove.mockReset();
    state.peoples = [people("p1", "Elf", 80), people("p2", "Human", 10)];
  });

  // Bug: a search hit for a people (`?people=`) landed on the chapter with nothing open; an id that is no people must open nothing.
  it("opens the people a search link names, and nothing for an unknown id", async () => {
    routeState.query = { people: "p2" };
    const w = mountIt();
    await flushPromises();
    expect(w.get("[data-testid=people-editor]").text()).toContain("Human");
    routeState.query = { people: "nobody" };
    const none = mountIt();
    await flushPromises();
    expect(none.find("[data-testid=people-editor]").exists()).toBe(false);
  });

  it("adds a chosen species at 0%, as a record the campaign has", async () => {
    const w = mountIt();
    const [speciesPicker] = w.findAllComponents(EntityCombobox);
    speciesPicker.vm.$emit("update:modelValue", "srd_elf");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ kind: "species", recordId: "srd_elf", fromLibrary: true, percent: 0, name: "" });
  });

  // Bug: a species the DM wrote (a uuid) was filed as a book's species, which the table refuses.
  it("tells a species the DM wrote from a book's by its id", async () => {
    const w = mountIt();
    w.findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "0f8fad5b-d9cb-469f-a165-70867728950e");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ kind: "species", recordId: "0f8fad5b-d9cb-469f-a165-70867728950e", fromLibrary: false, percent: 0, name: "" });
  });

  // Bug: a bestiary creature was added with the wrong source, so a library creature was written as the DM's own.
  it("adds a chosen creature with the source the bestiary entry says", async () => {
    const w = mountIt();
    const creaturePicker = w.findAllComponents(EntityCombobox)[1];
    creaturePicker.vm.$emit("update:modelValue", "srd_owlbear");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ kind: "creature", recordId: "srd_owlbear", fromLibrary: true, percent: 0, name: "" });
  });

  // Bug: the bestiary index (3,500 rows) loaded with the page instead of when the creature picker was opened.
  it("reads the bestiary only once the creature picker has been opened", async () => {
    const w = mountIt();
    expect(state.monsterEnabled()).toBe(false);
    w.findAllComponents(EntityCombobox)[1].vm.$emit("open");
    await flushPromises();
    expect(state.monsterEnabled()).toBe(true);
  });

  // Bug: a species already listed was offered again, and adding it hit the table's one-share-per-people index.
  it("does not offer a species or a creature that is already listed", () => {
    state.peoples = [
      people("p1", "Elf", 80, { recordId: "srd_elf" }),
      people("p3", "Owlbear", 5, { kind: "creature", recordId: "srd_owlbear" }),
    ];
    const w = mountIt();
    const [speciesPicker, creaturePicker] = w.findAllComponents(EntityCombobox);
    expect(optionsOf(speciesPicker).map((o) => o.name)).toEqual(["Gnoll Kin"]);
    expect(optionsOf(creaturePicker).map((o) => o.name)).toEqual(["Marsh Hag"]);
  });

  // Bug: a second people of a listed record (a nation of humans) could not be added, because the record was never offered again.
  it("offers a listed record again once the people to add is named, and sends the name", async () => {
    state.peoples = [people("p1", "Elf", 80, { recordId: "srd_elf" })];
    const w = mountIt();
    await w.get("input[aria-label='Name of the people to add']").setValue("the Vell");
    const [speciesPicker] = w.findAllComponents(EntityCombobox);
    expect(optionsOf(speciesPicker).map((o) => o.name)).toContain("Elf");
    speciesPicker.vm.$emit("update:modelValue", "srd_elf");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ kind: "species", recordId: "srd_elf", fromLibrary: true, percent: 0, name: "the Vell" });
  });

  // Bug: a record that stands behind only a named people was hidden from the unnamed add, though one unnamed is allowed.
  it("keeps a record offered unnamed when only a named people holds it", () => {
    state.peoples = [people("p1", "the Vell", 30, { recordId: "srd_elf", ownName: "the Vell", recordName: "Elf" })];
    const w = mountIt();
    expect(optionsOf(w.findAllComponents(EntityCombobox)[0]).map((o) => o.name)).toContain("Elf");
  });

  // Bug: a species and a creature that share an id string hid each other from the pickers (the match ignored the kind).
  it("keeps a creature offered when only a species of the same record id is listed", () => {
    state.peoples = [people("p1", "Elf", 80, { kind: "species", recordId: "srd_owlbear" })];
    const w = mountIt();
    expect(optionsOf(w.findAllComponents(EntityCombobox)[1]).length).toBe(2);
  });

  it("lists each people with its kind and share, and opens none until one is chosen", () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=people-mark]").map((m) => m.text())).toEqual(["80%", "10%"]);
    expect(w.find("[data-testid=people-editor]").exists()).toBe(false);
  });

  // Bug: the pane showed the first people's share for whichever row was chosen.
  it("opens the people that was chosen, with its share in the field", async () => {
    const w = mountIt();
    await open(w, "p2");
    expect(w.get("[data-testid=people-editor]").text()).toContain("Human");
    expect((w.get("input[aria-label='Share of Human, percent']").element as HTMLInputElement).value).toBe("10");
  });

  // Bug: the name field saved the record's name back as an own name, or a cleared field never went back to the record's name.
  it("names a people, and clears the name to go back to the record's", async () => {
    state.peoples = [people("p1", "the Vell", 30, { ownName: "the Vell", recordName: "Human" })];
    const w = mountIt();
    await open(w, "p1");
    await setField(w, "Name of this people", "");
    expect(mocks.rename).toHaveBeenCalledWith("p1", null);
    await setField(w, "Name of this people", "the Vellish");
    expect(mocks.rename).toHaveBeenLastCalledWith("p1", "the Vellish");
  });

  it("saves a share when the field is left", async () => {
    const w = mountIt();
    await open(w, "p2");
    await setField(w, "Share of Human, percent", "15");
    expect(mocks.setPercent).toHaveBeenCalledWith("p2", 15);
  });

  // Bug: a total past 100 was sent and the database refused it at commit, instead of the screen saying so first.
  it("says a total past 100 and does not save it", async () => {
    const w = mountIt();
    await open(w, "p2");
    await setField(w, "Share of Human, percent", "30");
    expect(w.find("[role=alert]").text()).toContain("110%");
    expect(mocks.setPercent).not.toHaveBeenCalled();
  });

  it("shows the running total and what is left for anyone else", () => {
    const w = mountIt();
    expect(w.get("[data-testid=share-total]").text()).toContain("Adds up to 90%. The other 10% is anyone else.");
  });

  // Bug: remove only hid the row, and the people stayed in the table; the pane stayed open on a people that was gone.
  it("removes the open people from the footer and closes the pane", async () => {
    const w = mountIt();
    await open(w, "p2");
    await w.get("[data-testid=canon-entry-delete]").trigger("click");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("p2");
    expect(w.find("[data-testid=people-editor]").exists()).toBe(false);
  });

  // Bug: a people another DM listed linked to a record this reader cannot open.
  it("links to the species or creature record, and not for one it may not read", async () => {
    state.peoples = [people("p1", "Elf", 80, { recordId: "srd_elf" }), people("p3", "Owlbear", 5, { kind: "creature", recordId: "srd_owlbear" }), people("p4", "Other", 5, { readable: false })];
    const w = mountIt();
    await open(w, "p1");
    expect(w.find("a[href='/species/srd_elf']").exists()).toBe(true);
    await open(w, "p3");
    expect(w.find("a[href='/monsters/srd_owlbear']").exists()).toBe(true);
    await open(w, "p4");
    expect(w.get("[data-testid=people-editor]").find("a").exists()).toBe(false);
  });

  // Bug: a world with no peoples showed an empty share list with a stray "Adds up" line instead of saying what a people is.
  it("says what a people is, with no Familiar request (#1279 item 10: the helper has no peoples mode), while none is listed; and says nothing while loading", () => {
    state.peoples = [];
    const w = mountIt();
    expect(w.text()).toContain("No peoples yet");
    expect(w.find("[data-testid=canon-suggest]").exists()).toBe(false);
    expect(w.find("[data-testid=share-row]").exists()).toBe(false);
    state.loading = true;
    expect(mountIt().text()).not.toContain("No peoples yet");
    state.loading = false;
  });
});
