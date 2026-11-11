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

function open(extra: Record<string, unknown> = {}) {
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
        footerTitle: "chapter",
        bookTitle: "A letter",
        inkFriendly: false,
        theme: "letter",
      },
      chapterSummaries: [],
      reading: true,
      ...extra,
    },
    global: { stubs: { ScriptoriumInspectBar: { template: '<div data-testid="inspect-bar" />' } } },
  });
}

describe("ScriptoriumPreviewPane", () => {
  // A new handout opened on "0 pages" and half a screen of nothing: the engine
  // never lays out an empty chapter, so Read as spreads draws the bare paper itself.
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

  // Fails on: the layout host being drawn for the writer behind the page they
  // type on. (That it hides with visibility, never display:none, is CSS the
  // test DOM cannot compute; it is on the styles of .preview-offscreen.)
  it("off screen, is hidden from assistive tech and shows no spread bar or blank sheet", async () => {
    preview.pageCount = 1;
    preview.rendering = false;
    const wrapper = open();
    await wrapper.setProps({ reading: false });
    const pane = wrapper.get("[data-testid=preview-pane]");
    expect(pane.classes()).toContain("preview-offscreen");
    expect(pane.attributes("aria-hidden")).toBe("true");
    expect(wrapper.find("[data-testid=inspect-bar]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=preview-blank-sheet]").exists()).toBe(false);
  });

  // Fails on: the preview drawing white pages for a book whose editor sheet and PDF are grey.
  it("paints the book's paper and ribbon on the host the pages are laid out in", () => {
    preview.pageCount = 1;
    const wrapper = open({ settings: { ...open().props("settings"), theme: "onednd2024" }, paperTone: "grey", footerStyle: "ribbon" });
    const host = wrapper.get(".paged-book");
    expect(host.classes()).toEqual(expect.arrayContaining(["sc-paper--grey", "sc-footer-style--ribbon"]));
  });

  it("reading, is a full-screen labelled page with the spread bar", () => {
    preview.pageCount = 1;
    const wrapper = open();
    const pane = wrapper.get("[data-testid=preview-pane]");
    expect(pane.attributes("aria-label")).toBe("Read the book as spreads");
    expect(pane.classes()).toContain("fixed");
    expect(wrapper.find("[data-testid=inspect-bar]").exists()).toBe(true);
  });
});
