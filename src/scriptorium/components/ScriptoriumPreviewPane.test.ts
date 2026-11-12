// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import ScriptoriumPreviewPane from "./ScriptoriumPreviewPane.vue";

const preview = vi.hoisted(() => ({
  pageCount: 0 as number | null,
  rendering: false,
  furniture: undefined as undefined | (() => { items: unknown[]; options?: Record<string, unknown> } | undefined),
}));

vi.mock("@/scriptorium/composables/useBookPreview", () => ({
  useBookPreview: (opts: { furniture?: typeof preview.furniture }) => {
    // What the pane hands the layout engine as its furniture: read by the dressing tests.
    preview.furniture = opts.furniture;
    return {
      isRendering: ref(preview.rendering),
      error: ref(null),
      result: ref(preview.pageCount === null ? null : { pageCount: preview.pageCount, pages: [], chapters: [] }),
      progress: ref(null),
      scheduleRender: vi.fn(),
    };
  },
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
    expect(host.classes()).toEqual(expect.arrayContaining(["sc-paper", "sc-footer-style--ribbon"]));
    expect(host.attributes("style")).toContain("--sc-paper-image");
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

describe("ScriptoriumPreviewPane page dressing", () => {
  const DRESSING = {
    v: 1,
    seed: 5,
    stain: { on: true, strength: 0.6 },
    wash: { on: false, strength: 0.5 },
    corners: { on: false, strength: 0.5 },
  } as const;

  // Fails on: the paged preview and the PDF dressing a book differently, because the pane forgot to hand the engine the dressing.
  it("hands the layout engine the book's dressing and whether it is a handout", () => {
    open({ dressing: DRESSING, handout: true });
    expect(preview.furniture?.()?.options).toMatchObject({ dressing: DRESSING, handout: true });
  });

  // Fails on: stains printed on a book set ink-friendly, which is the one finish that must print plain white.
  it("leaves the dressing off an ink-friendly book", () => {
    open({ dressing: DRESSING, settings: { ...open().props("settings"), inkFriendly: true } });
    expect(preview.furniture?.()?.options?.dressing).toBeNull();
  });

  // Fails on: a change in Book settings needing a re-layout (or a reload) before the pages show it.
  it("draws a changed dressing onto the laid-out pages in place, and takes it away again", async () => {
    preview.pageCount = 1;
    const wrapper = open({ reading: false });
    const host = wrapper.get(".paged-book").element;
    host.innerHTML = '<div class="pagedjs_page" data-chapter-id="c" data-chapter-page="1"><div class="pagedjs_pagebox"></div></div>';
    await wrapper.setProps({ dressing: DRESSING });
    expect(host.querySelectorAll(".sc-dressing")).toHaveLength(1);
    await wrapper.setProps({ dressing: null });
    expect(host.querySelectorAll(".sc-dressing")).toHaveLength(0);
  });
});
