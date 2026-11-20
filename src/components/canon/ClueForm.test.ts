import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";

vi.mock("@/composables/quests/useBeatOptions", () => ({ useBeatOptions: () => ({ data: ref([]) }) }));

import ClueForm from "./ClueForm.vue";

const PickerStub = { name: "WorldEntityPicker", emits: ["pick"], template: `<button data-testid="pick" @click="$emit('pick', { kind: 'location', id: 'p1', name: 'Sift\\'s Room' })" />` };
const mountForm = () => mount(ClueForm, { global: { stubs: { WorldEntityPicker: PickerStub, EntityCombobox: true } } });

describe("ClueForm", () => {
  it("will not add a clue that says it lies at a place until a place is chosen, so a clue is never filed at nothing by mistake", async () => {
    const w = mountForm();
    await w.find("input").setValue("A locket");
    expect(w.find("button[type=submit]").attributes("disabled")).toBeDefined();
    await w.find("[data-testid=pick]").trigger("click");
    expect(w.find("button[type=submit]").attributes("disabled")).toBeUndefined();
  });

  it("emits the line and the chosen place", async () => {
    const w = mountForm();
    await w.find("input").setValue("A locket");
    await w.find("[data-testid=pick]").trigger("click");
    await w.find("form").trigger("submit");
    expect(w.emitted("submit")?.[0]).toEqual([{ title: "A locket", where: { kind: "location", id: "p1" } }]);
  });

  it("lets a clue lie nowhere yet, with just its line", async () => {
    const w = mountForm();
    await w.find("input").setValue("A rumour");
    const nowhere = w.findAll("button").find((b) => b.text() === "Nowhere yet");
    await nowhere?.trigger("click");
    await w.find("form").trigger("submit");
    expect(w.emitted("submit")?.[0]).toEqual([{ title: "A rumour", where: null }]);
  });

  it("drops a chosen place when the kind changes, so a place's id is never filed as a person's", async () => {
    const w = mountForm();
    await w.find("[data-testid=pick]").trigger("click");
    expect(w.find("[data-testid=where-picked]").exists()).toBe(true);
    await w.findAll("button").find((b) => b.text() === "A person")?.trigger("click");
    expect(w.find("[data-testid=where-picked]").exists()).toBe(false);
  });
});
