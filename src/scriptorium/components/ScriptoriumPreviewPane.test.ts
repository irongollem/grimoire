// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ScriptoriumPreviewPane from "./ScriptoriumPreviewPane.vue";

const preview = vi.hoisted(() => ({ pageCount: 0 as number | null, rendering: false }));

vi.mock("@/scriptorium/composables/useBookPreview", () => ({
  useBookPreview: () => ({
    isRendering: ref(preview.rendering),
    error: ref(null),
    result: ref(preview.pageCount === null ? null : { pageCount: preview.pageCount, pages: [], chapters: [] }),
    progress: ref(null),
    scheduleRender: vi.fn(),
  }),
}));
vi.mock("@/scriptorium/composables/useFurnitureEditing", () => ({ useFurnitureEditing: vi.fn() }));
vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));

function open() {
  return mount(ScriptoriumPreviewPane, {
    props: {
      documentId: "d1",
      title: "A letter",
      chapters: () => [],
      changes: 0,
      settings: {
        pageSize: "A5",
        isTwoColumn: false,
        showPageNumbers: false,
        pageNumberStart: 1,
        footerText: "",
        inkFriendly: false,
        theme: "letter",
      },
      chapterSummaries: [],
      active: true,
      mode: "split",
      forPlayers: true,
    },
  });
}

describe("ScriptoriumPreviewPane", () => {
  // A new handout opened on "0 pages" and half a screen of nothing: the engine
  // never lays out an empty chapter, so the pane draws the bare paper itself.
  it.each([
    ["no pages laid out", 0, false, true],
    ["a page laid out", 1, false, false],
    ["still laying out", 0, true, false],
    ["no layout yet", null, false, false],
  ] as const)("with %s, shows the blank sheet: %s", async (_case, pageCount, rendering, shown) => {
    preview.pageCount = pageCount;
    preview.rendering = rendering;
    const wrapper = open();
    await flushPromises();
    expect(wrapper.find("[data-testid=preview-blank-sheet]").exists()).toBe(shown);
  });
});
