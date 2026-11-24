import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";

vi.mock("@/composables/useToast", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

import VoiceLibraryPanel from "./VoiceLibraryPanel.vue";

describe("VoiceLibraryPanel", () => {
  // Bug caught: the first search asking for page 1 of a library that numbers its pages from 0, so the best matches
  // were never shown.
  it("asks for the library's first page, then the next on More voices", async () => {
    const searchLibrary = vi.fn(async () => ({ voices: [], hasMore: true }));
    const w = mount(VoiceLibraryPanel, { props: { studio: { searchLibrary, addFromLibrary: { isPending: { value: false } } } as never }, global: { stubs: { VoiceSlotFieldsDialog: true } } });
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(searchLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ page: 0 }));
    await w.findAll("button").find((b) => b.text().includes("More voices"))!.trigger("click");
    await flushPromises();
    expect(searchLibrary).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  });
});
