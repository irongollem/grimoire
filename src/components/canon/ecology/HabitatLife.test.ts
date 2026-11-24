import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { computed, ref } from "vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";

const mocks = vi.hoisted(() => ({ add: vi.fn(), setPercent: vi.fn(), remove: vi.fn() }));
const state = vi.hoisted(() => ({ life: [] as unknown[], monsterEnabled: (() => false) as () => boolean }));

vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useHabitatEditing: () => ({
    life: computed(() => state.life),
    addLife: mocks.add,
    setLifePercent: mocks.setPercent,
    removeLife: mocks.remove,
  }),
}));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({
  useMonsterIndex: (options: () => { enabled?: boolean }) => {
    state.monsterEnabled = () => options().enabled === true;
    return { data: ref([{ id: "srd_owlbear", name: "Owlbear", is_shared: true }, { id: "9c2e0000-0000-4000-8000-000000000000", name: "Marsh Hag", is_shared: false }]) };
  },
}));

import HabitatLife from "./HabitatLife.vue";

const habitat = { id: "h1", name: "Salt marsh", description: null, sortOrder: 0 };
const eel = (id: string, percent: number, over: Record<string, unknown> = {}) => ({
  id, habitatId: "h1", name: `Eel ${id}`, percent, recordId: `r-${id}`, fromLibrary: true, readable: true, ...over,
});
const links = { RouterLink: { props: ["to"], template: "<a :href='to'><slot /></a>" } };
const mountIt = () => mount(HabitatLife, { props: { habitat }, global: { stubs: links, directives: { "no-pwm": {} } } });
const optionsOf = (picker: { props: () => unknown }) => (picker.props() as { options: { name: string }[] }).options;

async function setField(w: ReturnType<typeof mount>, label: string, value: string) {
  const input = w.find(`input[aria-label="${label}"]`);
  (input.element as HTMLInputElement).value = value;
  await input.trigger("change");
  await flushPromises();
}

describe("HabitatLife", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    state.life = [eel("a", 40), eel("b", 20), { ...eel("z", 50), habitatId: "other" }];
  });

  // Bug (the maintainer's rejection of free text): a creature could be typed, so a name matching nothing in the bestiary
  // ended up in the world. The only text field is the picker; the rest are share numbers.
  it("has no free-text creature field: the only text field is the bestiary picker", () => {
    const w = mountIt();
    const texts = w.findAll("input[type=text]");
    expect(texts.map((i) => i.attributes("placeholder"))).toEqual(["Add a creature…"]);
  });

  // Bug: another habitat's creatures were listed here, or counted into this habitat's total.
  it("lists only this habitat's creatures and totals only them", () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=share-row]")).toHaveLength(2);
    expect(w.get("[data-testid=share-total]").text()).toBe("Adds up to 60%. The other 40% is anything else.");
  });

  // Bug: a bestiary creature was added with the wrong source, so a library creature was written as the DM's own.
  it.each([
    ["srd_owlbear", true],
    ["9c2e0000-0000-4000-8000-000000000000", false],
  ])("adds creature %s at 0% in this habitat with its source (library: %s)", async (id, fromLibrary) => {
    const w = mountIt();
    w.findComponent(EntityCombobox).vm.$emit("update:modelValue", id);
    await flushPromises();
    expect(mocks.add).toHaveBeenCalledWith({ habitatId: "h1", recordId: id, fromLibrary, percent: 0 });
  });

  // Bug: the bestiary index (3,500 rows) loaded with the page instead of when the picker was opened.
  it("reads the bestiary only once the picker has been opened", async () => {
    const w = mountIt();
    expect(state.monsterEnabled()).toBe(false);
    w.findComponent(EntityCombobox).vm.$emit("open");
    await flushPromises();
    expect(state.monsterEnabled()).toBe(true);
  });

  // Bug: a creature already here was offered again, and adding it hit the one-creature-per-habitat index.
  it("does not offer a creature this habitat already holds, but does offer one another habitat holds", () => {
    state.life = [eel("a", 40, { recordId: "srd_owlbear" }), eel("z", 10, { habitatId: "other", recordId: "9c2e0000-0000-4000-8000-000000000000" })];
    const w = mountIt();
    expect(optionsOf(w.findComponent(EntityCombobox)).map((o) => o.name)).toEqual(["Marsh Hag"]);
  });

  it("saves a share when the field is left", async () => {
    const w = mountIt();
    await setField(w, "Share of Eel b, percent", "25");
    expect(mocks.setPercent).toHaveBeenCalledWith("b", 25);
  });

  // Bug: a habitat at 101% was sent and the database refused it at commit, instead of the screen saying so first.
  it("says shares past 100 and does not save them", async () => {
    const w = mountIt();
    await setField(w, "Share of Eel b, percent", "61");
    expect(w.find("[role=alert]").text()).toContain("101%");
    expect(mocks.setPercent).not.toHaveBeenCalled();
  });

  it("removes the creature whose button was pressed", async () => {
    const w = mountIt();
    await w.find("button[aria-label='Remove Eel b']").trigger("click");
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("b");
  });

  it("links to the bestiary's new-creature route", () => {
    expect(mountIt().findAll("a").map((a) => a.attributes("href"))).toEqual(["/monsters/new"]);
  });
});
