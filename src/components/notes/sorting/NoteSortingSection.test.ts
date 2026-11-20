import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const items = ref<unknown[]>([]);
vi.mock("@/composables/notes/useNoteSorting", () => ({ useNoteSorting: () => ({ data: items }), useSortNote: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }) }));

import NoteSortingSection from "./NoteSortingSection.vue";

const row = (id: string) => ({ was: "lore", note: { id, title: id, content: null } });

describe("NoteSortingSection", () => {
  it("shows nothing once the list is empty", () => {
    // Fails if the line lingers after the last note is sorted.
    items.value = [];
    expect(mount(NoteSortingSection, { global: { stubs: { NoteSortingRow: true } } }).find("section").exists()).toBe(false);
  });

  it("says how many are left and opens the list on request", async () => {
    items.value = [row("a"), row("b")];
    const w = mount(NoteSortingSection, { global: { stubs: { NoteSortingRow: { template: "<li class='r' />" } } } });
    expect(w.text()).toContain("2 notes to sort, from before lore and sessions moved to Canon");
    expect(w.findAll(".r")).toHaveLength(0);
    await w.find("button").trigger("click");
    expect(w.findAll(".r")).toHaveLength(2);
  });
});
