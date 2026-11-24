import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

vi.mock("@/composables/quests/useBeatOptions", () => ({ useBeatOptions: () => ({ data: ref([]) }) }));
vi.mock("@/scriptorium/composables/useScriptorium", () => ({ useScriptoriumDocuments: () => ({ data: ref([]) }) }));

import WherePicker from "./WherePicker.vue";

const labels = (forClue: boolean) =>
  mount(WherePicker, { props: { forClue }, global: { stubs: { WorldEntityPicker: true, EntityCombobox: true } } })
    .findAll("button")
    .map((b) => b.text());

describe("WherePicker", () => {
  // Bug: a lore passage was offered "An item" or "A handout", but passages have no such column (wherePatch throws).
  it("offers an item and a handout to a clue, and not to a lore passage", () => {
    expect(labels(true)).toEqual(expect.arrayContaining(["An item", "A handout"]));
    expect(labels(false)).not.toContain("An item");
    expect(labels(false)).not.toContain("A handout");
  });
});
