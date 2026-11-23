import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";

const mocks = vi.hoisted(() => ({ add: vi.fn(), setPercent: vi.fn(), remove: vi.fn() }));
const state = vi.hoisted(() => ({ peoples: [] as unknown[], monsterEnabled: (() => false) as () => boolean }));

vi.mock("@/composables/canon/useCampaignPeoples", async () => {
  const { computed } = await import("vue");
  return {
    usePeoplesEditing: () => ({
      peoples: computed(() => state.peoples),
      addPeople: mocks.add,
      setPercent: mocks.setPercent,
      removePeople: mocks.remove,
    }),
  };
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

import WorldPeoples from "./WorldPeoples.vue";

// EntityCombobox is generic, so its props are not typed through the wrapper: read them as the shape the picker is given.
const optionsOf = (picker: { props: () => unknown }) => (picker.props() as { options: { name: string }[] }).options;

const people = (id: string, name: string, percent: number, over: Record<string, unknown> = {}) => ({
  id, name, percent, kind: "species", recordId: `r-${id}`, fromLibrary: true, ...over,
});

const links = { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } };
const mountIt = () => mount(WorldPeoples, { global: { stubs: links, directives: { "no-pwm": {} } } });

async function setField(w: ReturnType<typeof mount>, label: string, value: string) {
  const input = w.find(`input[aria-label="${label}"]`);
  (input.element as HTMLInputElement).value = value;
  await input.trigger("change");
  await flushPromises();
}

describe("WorldPeoples", () => {
  beforeEach(() => {
    mocks.add.mockReset();
    mocks.setPercent.mockReset();
    mocks.remove.mockReset();
    state.peoples = [people("p1", "Elf", 80), people("p2", "Human", 10)];
  });

  // Bug (the maintainer's rejection): a people could be typed as free text, so a name that matched no species or
  // creature ended up in the world.
  it("has no free-text name field: the only text fields are the two pickers and the share inputs", () => {
    const w = mountIt();
    const texts = w.findAll("input[type=text]");
    expect(texts).toHaveLength(2);
    expect(texts.map((i) => i.attributes("placeholder"))).toEqual(["Add a species…", "Add a creature…"]);
    expect(w.find("input[aria-label^='Name of']").exists()).toBe(false);
  });

  it("adds a chosen species at 0%, as a record the campaign has", async () => {
    const w = mountIt();
    const [speciesPicker] = w.findAllComponents(EntityCombobox);
    speciesPicker.vm.$emit("update:modelValue", "srd_elf");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ kind: "species", recordId: "srd_elf", fromLibrary: true, percent: 0 });
  });

  // Bug: a species the DM wrote (a uuid) was filed as a book's species, which the table refuses.
  it("tells a species the DM wrote from a book's by its id", async () => {
    const w = mountIt();
    w.findAllComponents(EntityCombobox)[0].vm.$emit("update:modelValue", "0f8fad5b-d9cb-469f-a165-70867728950e");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ kind: "species", recordId: "0f8fad5b-d9cb-469f-a165-70867728950e", fromLibrary: false, percent: 0 });
  });

  // Bug: a bestiary creature was added with the wrong source, so a library creature was written as the DM's own.
  it("adds a chosen creature with the source the bestiary entry says", async () => {
    const w = mountIt();
    const creaturePicker = w.findAllComponents(EntityCombobox)[1];
    creaturePicker.vm.$emit("update:modelValue", "srd_owlbear");
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ kind: "creature", recordId: "srd_owlbear", fromLibrary: true, percent: 0 });
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

  // Bug: a species and a creature that share an id string hid each other from the pickers (the match ignored the kind).
  it("keeps a creature offered when only a species of the same record id is listed", () => {
    state.peoples = [people("p1", "Elf", 80, { kind: "species", recordId: "srd_owlbear" })];
    const w = mountIt();
    expect(optionsOf(w.findAllComponents(EntityCombobox)[1]).length).toBe(2);
  });

  it("saves a share when the field is left", async () => {
    const w = mountIt();
    await setField(w, "Share of Human, percent", "15");
    expect(mocks.setPercent).toHaveBeenCalledWith("p2", 15);
  });

  // Bug: a total past 100 was sent and the database refused it at commit, instead of the screen saying so first.
  it("says a total past 100 and does not save it", async () => {
    const w = mountIt();
    await setField(w, "Share of Human, percent", "30");
    expect(w.find("[role=alert]").text()).toContain("110%");
    expect(mocks.setPercent).not.toHaveBeenCalled();
  });

  it("shows the running total and what is left for anyone else", () => {
    const w = mountIt();
    expect(w.get("[data-testid=peoples-total]").text()).toBe("Adds up to 90%. The other 10% is anyone else.");
  });

  // Bug: remove only hid the row, and the people stayed in the table.
  it("removes the people whose button was pressed", async () => {
    const w = mountIt();
    await w.find("button[aria-label='Remove Human']").trigger("click");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("p2");
  });

  it("links to the existing editors to make a new species or creature", () => {
    const w = mountIt();
    const hrefs = w.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).toEqual(["/species/new", "/monsters/new"]);
  });
});
