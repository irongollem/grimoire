import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
const arcs = ref([{ id: "a1", name: "The drowned god" }, { id: "a2", name: "The guild" }]);
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => ({ data: arcs }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useUpdateCanonEntry: () => ({ mutate: mocks.update }) }));

import EntryArcPicker from "./EntryArcPicker.vue";

const mountPicker = (over = {}) => mount(EntryArcPicker, { props: { entry: canonEntry({ id: "t1", part: "truth", ...over }) } });

describe("EntryArcPicker", () => {
  beforeEach(() => {
    mocks.update.mockReset();
    arcs.value = [{ id: "a1", name: "The drowned god" }, { id: "a2", name: "The guild" }];
  });

  // Bug caught: the picker writing the arc's name, or to the wrong column.
  it("saves the chosen arc's id as the entry's arc_id", async () => {
    await mountPicker().find("select").setValue("a2");
    expect(mocks.update).toHaveBeenCalledWith({ id: "t1", patch: { arc_id: "a2" } });
  });

  // Bug caught: "No arc" saving the string "null" (or nothing), so an entry could never leave its arc.
  it("saves null for No arc", async () => {
    const w = mountPicker({ arc_id: "a1" });
    const select = w.find("select");
    (select.element as HTMLSelectElement).selectedIndex = 0; // the "No arc" option
    await select.trigger("change");
    expect(mocks.update).toHaveBeenCalledWith({ id: "t1", patch: { arc_id: null } });
  });

  // Bug caught: a premise entry offered an arc, which the table refuses (23514).
  it("never shows on a premise entry", () => {
    expect(mountPicker({ part: "premise", premise_kind: "theme" }).find("select").exists()).toBe(false);
  });

  // Bug caught: every entry on a campaign that never made an arc growing a picker with one option.
  it("stays out of the way until an arc exists", () => {
    arcs.value = [];
    expect(mountPicker().find("select").exists()).toBe(false);
  });

  it("shows the entry's current arc", () => {
    expect((mountPicker({ arc_id: "a2" }).find("select").element as HTMLSelectElement).selectedOptions[0].text).toBe("The guild");
  });
});
