import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia } from "pinia";

const mocks = vi.hoisted(() => ({ confirm: vi.fn(), remove: vi.fn(), rename: vi.fn(), saveDescription: vi.fn() }));

vi.mock("@/composables/canon/useCampaignHabitats", () => ({
  useHabitatEditing: () => ({ removeHabitat: mocks.remove, renameHabitat: mocks.rename, saveDescription: mocks.saveDescription }),
}));
vi.mock("@/composables/ask/useCanAsk", async () => {
  const { ref } = await import("vue");
  return { useCanAsk: () => ref(true) };
});
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/notes/useEntityMentionItems", async () => {
  const { computed } = await import("vue");
  return { useEntityMentionItems: () => ({ mentionItems: computed(() => []) }) };
});
vi.mock("@/components/common/richtext/RichTextEditor.vue", () => ({ default: { template: "<div data-testid='description-editor' />" } }));
vi.mock("./HabitatPlaces.vue", () => ({ default: { template: "<div />" } }));
vi.mock("./HabitatLife.vue", () => ({ default: { template: "<div />" } }));
vi.mock("./HabitatNotes.vue", () => ({ default: { template: "<div />" } }));

import HabitatEditor from "./HabitatEditor.vue";

const habitat = { id: "h1", name: "Salt marsh", description: null, sortOrder: 0 };
const mountIt = () => mount(HabitatEditor, { props: { habitat }, global: { plugins: [createPinia()] } });
const deleteButton = (w: ReturnType<typeof mountIt>) => w.findAll("button").find((b) => b.text() === "Delete this habitat")!;

describe("HabitatEditor", () => {
  beforeEach(() => Object.values(mocks).forEach((m) => m.mockReset()));

  // Bug: a cancelled confirm still deleted the habitat with its places and shares.
  it("keeps the habitat when the delete is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountIt();
    await deleteButton(w).trigger("click");
    await flushPromises();
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(w.emitted("delete")).toBeUndefined();
  });

  it("deletes after the DM confirms, and tells the list so it can close the editor", async () => {
    mocks.confirm.mockResolvedValue(true);
    const w = mountIt();
    await deleteButton(w).trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith("h1");
    expect(w.emitted("delete")).toHaveLength(1);
  });

  // Bug: a name emptied by mistake renamed the habitat to nothing (the table refuses it, and the DM lost the old name).
  it("renames when the field is left with new words, and saves nothing for a blank one", async () => {
    const w = mountIt();
    const input = w.find("textarea, input[aria-label=\"The habitat's name\"]");
    (input.element as HTMLInputElement).value = "Brackish marsh";
    await input.trigger("change");
    await flushPromises();
    expect(mocks.rename).toHaveBeenCalledWith("h1", "Brackish marsh");
    mocks.rename.mockReset();
    (input.element as HTMLInputElement).value = "   ";
    await input.trigger("change");
    await flushPromises();
    expect(mocks.rename).not.toHaveBeenCalled();
  });
});
