import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { computed, ref } from "vue";

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), remove: vi.fn(), update: vi.fn() }));
const state = vi.hoisted(() => ({ yields: [] as unknown[], entries: [] as unknown[] }));

vi.mock("@/composables/canon/useCampaignSpecies", () => ({
  useSpeciesEditing: () => ({ removeSpecies: mocks.remove, updateSpecies: mocks.update, yields: ref(state.yields) }),
}));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: ref(state.entries) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/notes/useEntityMentionItems", () => ({ useEntityMentionItems: () => ({ mentionItems: computed(() => []) }) }));
vi.mock("@/composables/ask/useCanAsk", () => ({ useCanAsk: () => ref(true) }));
vi.mock("@/components/common/richtext/RichTextEditor.vue", () => ({ default: { template: "<div />" } }));
import SpeciesEditor from "./SpeciesEditor.vue";

const species = { id: "s1", name: "Rime bear", scientificName: null as string | null, cladeId: null, kingdom: "animal" as const, livesAs: null, activity: null, seasons: {}, description: null, sortOrder: 0 };
const STUBBED = ["SpeciesForms", "SpeciesHabitats", "SpeciesLinks", "SpeciesNotes", "SpeciesRank", "SpeciesWhen", "SpeciesYields"];
const stubs = Object.fromEntries(STUBBED.map((name) => [name, { template: `<div data-testid='${name}' />` }]));
const mountIt = (over: Partial<typeof species> = {}) => mount(SpeciesEditor, { props: { species: { ...species, ...over } }, global: { stubs, plugins: [createPinia()] }, attachTo: document.body });
const deleteButton = (w: ReturnType<typeof mountIt>) => w.get("[data-testid=canon-entry-delete]");

describe("SpeciesEditor", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.update.mockResolvedValue(undefined);
    mocks.remove.mockResolvedValue(undefined);
    state.yields = [];
    state.entries = [];
  });

  // Bug: a cancelled confirm still deleted the species with its forms and links.
  it("keeps the species when the delete is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountIt();
    await deleteButton(w).trigger("click");
    await flushPromises();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(w.emitted("delete")).toBeUndefined();
  });

  it("deletes after the DM confirms and tells the list so it can close", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountIt();
    await deleteButton(w).trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("s1");
    expect(w.emitted("delete")).toHaveLength(1);
  });

  // Bug: a delete the server refused still closed the editor, so the DM thought the species was gone.
  it("stays open when the delete fails", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.remove.mockResolvedValue(null);
    const w = mountIt();
    await deleteButton(w).trigger("click");
    await flushPromises();
    expect(w.emitted("delete")).toBeUndefined();
  });

  // Bug: a blank common name emptied the species' name, or the scientific name could not be cleared.
  it("renames on a new name, refuses a blank one, and clears the scientific name", async () => {
    const w = mountIt({ scientificName: "Ursus glacialis" });
    const common = w.get("button[aria-label=\"The species' common name\"]");
    await common.trigger("click");
    await w.get("input[aria-label=\"The species' common name\"]").setValue("   ");
    await w.get("input[aria-label=\"The species' common name\"]").trigger("keydown.enter");
    expect(mocks.update).not.toHaveBeenCalled();
    await w.get("button[aria-label='The scientific name']").trigger("click");
    await w.get("input[aria-label='The scientific name']").setValue("");
    await w.get("input[aria-label='The scientific name']").trigger("keydown.enter");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith("s1", { scientificName: null });
  });

  // Bug: "how it lives" saved the label text instead of the closed value, or "Choose…" saved an invalid empty string.
  it("saves how it lives as its value and Choose as none", async () => {
    await mountIt({ livesAs: "herd" as never }).get("select[aria-label='How it lives']").setValue("pairs");
    expect(mocks.update).toHaveBeenLastCalledWith("s1", { livesAs: "pairs" });
    await mountIt({ livesAs: "herd" as never }).get("select[aria-label='How it lives']").setValue("");
    expect(mocks.update).toHaveBeenLastCalledWith("s1", { livesAs: null });
  });

  // Bug: the optional blocks were always drawn (a wall of empty cards), or an empty one could not be added.
  it("folds the empty optional blocks into Add… and shows one once chosen", async () => {
    const w = mountIt();
    expect(w.find("[data-testid=SpeciesYields]").exists()).toBe(false);
    expect(w.find("[data-testid=SpeciesWhen]").exists()).toBe(false);
    await w.get("[data-testid=canon-add-fold-button]").trigger("click");
    await (document.querySelector("[data-testid=canon-add-yields]") as HTMLElement).click();
    await flushPromises();
    expect(w.find("[data-testid=SpeciesYields]").exists()).toBe(true);
    expect(w.find("[data-testid=SpeciesNotes]").exists()).toBe(false);
  });

  it("shows a block that already holds something without being asked", () => {
    const w = mountIt({ activity: "night" as never });
    expect(w.find("[data-testid=SpeciesWhen]").exists()).toBe(true);
  });
});
