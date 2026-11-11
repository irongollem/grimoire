// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScriptoriumBookEditor from "./ScriptoriumBookEditor.vue";
import ScriptoriumBookSettings from "./ScriptoriumBookSettings.vue";
import { useAppUiStore } from "@/stores/ui/app";
import { useScriptoriumUiStore } from "@/scriptorium/stores/ui";
import type { ScriptoriumDocument } from "@/scriptorium/types";

const mocks = await vi.hoisted(async () => {
  const { ref: vueRef } = await import("vue");
  return {
  saveNow: vi.fn(),
  hold: vi.fn(),
  focusBlock: vi.fn(),
  deleteDoc: vi.fn(),
  removeImages: vi.fn(),
  confirm: vi.fn(),
  replace: vi.fn(),
  refetch: vi.fn(),
  list: vueRef<{ id: string; title: string }[]>([]),
  kind: "book" as "book" | "handout",
  query: {} as Record<string, string>,
  };
});

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: mocks.query, params: { id: "d1" }, name: "scriptorium-edit" }),
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
  onBeforeRouteUpdate: vi.fn(),
}));
vi.mock("@/composables/useUnsavedGuard", () => ({ useUnsavedGuard: vi.fn() }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }));
vi.mock("@/composables/useImageUpload", () => ({ removeRichTextImages: (...a: unknown[]) => mocks.removeImages(...a) }));
vi.mock("@/composables/campaign/useCampaigns", () => ({ useAllDmCampaigns: () => ({ data: ref([]) }) }));
vi.mock("@/stores/campaign", async () => {
  const { defineStore } = await import("pinia");
  const { ref } = await import("vue");
  return { useCampaignStore: defineStore("campaign-test", () => ({ activeCampaignId: ref<string | null>(null) })) };
});
vi.mock("@/scriptorium/composables/useScriptorium", () => ({
  useUpdateScriptoriumDocument: () => ({ mutateAsync: vi.fn() }),
  useDeleteScriptoriumDocument: () => ({ mutateAsync: mocks.deleteDoc }),
}));
vi.mock("@/scriptorium/composables/useScriptoriumChapters", () => ({
  useBookChapterList: () => ({ data: computed(() => mocks.list.value), isLoading: ref(false) }),
  useCreateChapter: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useScriptoriumChapter: (id: { value: string }) => ({
    data: computed(() => (id.value ? { id: id.value, document_id: "d1", content: { type: "doc", content: [] }, updated_at: "1", title: "", word_count: 0, position: 0, created_at: "" } : undefined)),
  }),
}));
vi.mock("@/scriptorium/composables/useScriptoriumPdf", () => ({
  useScriptoriumPdf: () => ({ isExporting: ref(false), exportError: ref(null), progress: ref(null), exportPdf: vi.fn() }),
}));
vi.mock("@/scriptorium/composables/useBookChapterHtml", () => ({
  useBookChapterHtml: () => ({
    chapters: () => [],
    version: ref(0),
    entityRefs: ref([]),
    fullQuery: { refetch: mocks.refetch },
  }),
}));
vi.mock("@/scriptorium/composables/useBookSettings", () => ({
  useBookSettings: () => ({
    draft: { title: "Sothery", kind: mocks.kind, theme: "onednd2024", pageSize: "A4", isTwoColumn: false, showPageNumbers: false, pageNumberStart: 1, footerText: "", inkFriendly: false, campaignId: null, furniture: [], isPublished: false, tags: [] },
    patch: vi.fn(),
    status: ref("saved"),
    saveError: ref(""),
    dirty: ref(false),
    saveNow: vi.fn(),
    hold: vi.fn(),
    release: vi.fn(),
  }),
}));

const Rail = defineComponent({
  props: ["chapters", "currentId", "beforeLeave", "numbering"],
  emits: ["select"],
  setup(props, { emit }) {
    return () =>
      h("div", { "data-testid": "rail" }, (props.chapters as { id: string }[]).map((c) =>
        h("button", { "data-testid": `go-${c.id}`, onClick: async () => { await props.beforeLeave(); emit("select", c.id); } }),
      ));
  },
});
/** v-show hides with an inline display:none; isVisible needs an attached tree, which these mounts are not. */
const hidden = (w: { find: (s: string) => { attributes: (n: string) => string | undefined } }) =>
  (w.find("[data-testid=kit]").attributes("style") ?? "").includes("display: none");
const Kit = defineComponent({
  setup: () => () => h("div", { "data-testid": "kit" }),
});
const Editor = defineComponent({
  props: ["chapter", "flow", "panelHidden", "pageContext"],
  emits: ["openSettings"],
  setup(_p, { expose, slots, emit }) {
    expose({ saveNow: mocks.saveNow, hold: mocks.hold, release: vi.fn(), focusBlock: mocks.focusBlock, blockIdAtCursor: () => null, dirty: false });
    return () =>
      h(
        "div",
        { "data-testid": "chapter-editor-stub", "data-flow": _p.flow ? "yes" : "no", "data-panel-hidden": String(_p.panelHidden) },
        [slots.footer?.(), h("button", { "data-testid": "panel-settings", onClick: () => emit("openSettings") })],
      );
  },
});
const Pane = defineComponent({
  props: ["reading"],
  emits: ["flow", "close", "progress", "layout"],
  setup(props, { emit, slots }) {
    return () =>
      h("div", { "data-testid": "pane", "data-reading": String(props.reading) }, [
        h("button", { "data-testid": "pane-flow", onClick: () => emit("flow", { chapterId: "c1", pages: [] }) }),
        h("button", { "data-testid": "pane-close", onClick: () => emit("close") }),
        h("button", { "data-testid": "pane-progress", onClick: () => emit("progress", { done: 4, total: 15 }) }),
        h("button", { "data-testid": "pane-laid-out", onClick: () => emit("layout", { pageCount: 1, pages: [], chapters: [], laidOutChapterIds: [], layoutMs: 1 }) }),
        slots.drawer?.(),
      ]);
  },
});
const Drawer = defineComponent({
  emits: ["goToNote"],
  setup(_p, { emit }) {
    return () => h("button", { "data-testid": "note", onClick: () => emit("goToNote", { chapterId: "c2", blockId: "b9" }) });
  },
});
const Header = defineComponent({
  props: ["focus"],
  emits: ["update:focus", "read"],
  setup(props, { emit }) {
    return () =>
      h("div", [
        h("button", { "data-testid": "focus", onClick: () => emit("update:focus", !props.focus) }),
        h("button", { "data-testid": "read", onClick: () => emit("read") }),
      ]);
  },
});

const doc = { id: "d1", title: "Sothery", kind: "book", doc_type: "custom", campaign_id: null, ai_provenance: null } as unknown as ScriptoriumDocument;

function open() {
  return mount(ScriptoriumBookEditor, {
    props: { doc },
    global: {
      stubs: {
        ChapterRail: Rail,
        BookKit: Kit,
        ScriptoriumChapterEditor: Editor,
        ScriptoriumPreviewPane: Pane,
        ScriptoriumBookHeader: Header,
        InspectNotesDrawer: Drawer,
        InspectNotesLayer: true,
        ScriptoriumBookSettings: true,
        ScriptoriumExportDialog: true,
        HandoutShareDialog: true,
        HandoutShareControl: true,
        HandoutAudienceLine: true,
      },
    },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  Object.values(mocks).forEach((m) => typeof m === "function" && "mockReset" in m && m.mockReset());
  mocks.list.value = [{ id: "c1", title: "One" }, { id: "c2", title: "Two" }];
  mocks.query = {};
  mocks.kind = "book";
  mocks.saveNow.mockResolvedValue(undefined);
  mocks.hold.mockResolvedValue(undefined);
  mocks.deleteDoc.mockResolvedValue(undefined);
  mocks.confirm.mockResolvedValue(true);
});

describe("ScriptoriumBookEditor", () => {
  it("steps the app's sidebar and top bar aside while open, and gives them back on unmount", () => {
    const wrapper = open();
    const ui = useAppUiStore();
    expect(ui.editorFocus).toBe(true);
    wrapper.unmount();
    expect(ui.editorFocus).toBe(false);
  });

  it("saves the chapter being left before the next one opens", async () => {
    const order: string[] = [];
    mocks.saveNow.mockImplementation(async () => { order.push("save"); });
    const wrapper = open();
    await flushPromises();
    mocks.replace.mockImplementation(() => { order.push("switch"); });
    await wrapper.find("[data-testid=go-c2]").trigger("click");
    await flushPromises();
    expect(order).toEqual(["save", "switch"]);
  });

  it("opens the chapter a note points at", async () => {
    const wrapper = open();
    await flushPromises();
    await wrapper.find("[data-testid=note]").trigger("click");
    await flushPromises();
    expect(mocks.saveNow).toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith({ query: { chapter: "c2" } });
  });

  // Fails on: Write mode's old gate, which handed the editor no pages until the writer switched to Split.
  it("gives the editor the open chapter's pages as soon as the layout reports them", async () => {
    const wrapper = open();
    await flushPromises();
    expect(wrapper.find("[data-testid=chapter-editor-stub]").attributes("data-flow")).toBe("no");
    await wrapper.find("[data-testid=pane-flow]").trigger("click");
    expect(wrapper.find("[data-testid=chapter-editor-stub]").attributes("data-flow")).toBe("yes");
  });

  // Fails on: Focus not hiding the chapter list, or not being remembered.
  it("Focus hides the chapter list and is remembered under its own key", async () => {
    localStorage.setItem("grimoire:scriptorium:editor-mode", "write");
    const wrapper = open();
    await flushPromises();
    expect(wrapper.find("[data-testid=rail]").exists()).toBe(true);
    await wrapper.find("[data-testid=focus]").trigger("click");
    expect(wrapper.find("[data-testid=rail]").exists()).toBe(false);
    expect(localStorage.getItem("grimoire:scriptorium:focus")).toBe("true");
  });

  // Fails on: the book kit living only in a book with several chapters, so a handout or a one-chapter
  // book has nothing to drag blocks from.
  it("shows the book kit with no tabs when the book has one chapter", async () => {
    mocks.list.value = [{ id: "c1", title: "One" }];
    const wrapper = open();
    await flushPromises();
    expect(hidden(wrapper)).toBe(false);
    expect(wrapper.find("[data-testid=rail-tabs]").exists()).toBe(false);
  });

  // Fails on: "From the campaign" on the toolbar doing nothing, because the kit is a tab the toolbar cannot reach.
  it("the toolbar's request for the campaign search shows the Book kit tab", async () => {
    const wrapper = open();
    await flushPromises();
    expect(hidden(wrapper)).toBe(true);
    useScriptoriumUiStore().askForCampaignSearch();
    await flushPromises();
    expect(hidden(wrapper)).toBe(false);
    expect(wrapper.find("[data-testid=rail]").exists()).toBe(false);
  });

  // Fails on: Focus hiding the chapter list but leaving the panel on screen.
  it("Focus hides the panel with the chapter list", async () => {
    const wrapper = open();
    await flushPromises();
    const hidden = () => wrapper.find("[data-testid=chapter-editor-stub]").attributes("data-panel-hidden");
    expect(hidden()).toBe("false");
    await wrapper.find("[data-testid=focus]").trigger("click");
    expect(hidden()).toBe("true");
  });

  // Fails on: the panel's Book settings link opening nothing, or the page saying the wrong chapter.
  it("tells the panel the paper and the chapter it is on, and opens the book settings from its link", async () => {
    mocks.query = { chapter: "c2" };
    const wrapper = open();
    await flushPromises();
    const context = wrapper.findComponent(Editor).props("pageContext");
    expect(context).toMatchObject({ paperLabel: "2024 book · A4 · One column", chapterNumber: 2, chapterTitle: "Two", isHandout: false });
    expect(wrapper.findComponent(ScriptoriumBookSettings).props("open")).toBe(false);
    await wrapper.find("[data-testid=panel-settings]").trigger("click");
    expect(wrapper.findComponent(ScriptoriumBookSettings).props("open")).toBe(true);
  });

  // Fails on: Read as spreads not opening, or Close/Escape leaving the writer inside it.
  it("Read as spreads opens the pane full screen and its close returns to the page", async () => {
    const wrapper = open();
    await flushPromises();
    const pane = () => wrapper.find("[data-testid=pane]").attributes("data-reading");
    expect(pane()).toBe("false");
    await wrapper.find("[data-testid=read]").trigger("click");
    expect(pane()).toBe("true");
    expect(wrapper.find("[data-testid=chapter-editor-stub]").exists()).toBe(true);
    await wrapper.find("[data-testid=pane-close]").trigger("click");
    expect(pane()).toBe("false");
  });

  // Fails on: a note's Edit this part leaving the writer inside Read as spreads.
  it("a note's jump to its text leaves Read as spreads", async () => {
    const wrapper = open();
    await flushPromises();
    await wrapper.find("[data-testid=read]").trigger("click");
    await wrapper.find("[data-testid=note]").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid=pane]").attributes("data-reading")).toBe("false");
  });

  // Fails on: the footer lingering after the book is numbered, or never showing.
  it("tells the chapter list the rest of the book is being numbered, until the first layout lands", async () => {
    const wrapper = open();
    await flushPromises();
    expect(wrapper.findComponent(Rail).props("numbering")).toEqual({ done: 0, total: null });
    await wrapper.find("[data-testid=pane-progress]").trigger("click");
    expect(wrapper.findComponent(Rail).props("numbering")).toEqual({ done: 4, total: 15 });
    await wrapper.find("[data-testid=pane-laid-out]").trigger("click");
    expect(wrapper.findComponent(Rail).props("numbering")).toBeNull();
  });

  it("stops the open chapter writing the moment the chapter list no longer holds it", async () => {
    open();
    await flushPromises();
    mocks.list.value = [{ id: "c2", title: "Two" }];
    await flushPromises();
    expect(mocks.hold).toHaveBeenCalled();
  });

  // #1115: a handout is one chapter on one paper, so its one chapter offers no second.
  it.each([
    ["book", true],
    ["handout", false],
  ] as const)("a one-chapter %s offers Add chapter: %s", async (kind, offered) => {
    mocks.kind = kind;
    mocks.list.value = [{ id: "c1", title: "One" }];
    const wrapper = open();
    await flushPromises();
    expect(wrapper.findAll("button").some((b) => b.text().includes("Add chapter"))).toBe(offered);
  });

  it("deletes the images of every chapter with the book, and leaves for the list", async () => {
    mocks.refetch.mockResolvedValue({
      data: [{ content: { n: "chapter one art" } }, { content: { n: "chapter two art" } }],
    });
    const wrapper = open();
    await flushPromises();
    wrapper.findComponent(ScriptoriumBookSettings).vm.$emit("delete");
    await flushPromises();
    expect(mocks.deleteDoc).toHaveBeenCalledWith("d1");
    expect(mocks.removeImages).toHaveBeenCalledTimes(2);
    expect(mocks.removeImages.mock.calls.map((c) => c[0]).join()).toContain("chapter two art");
    expect(mocks.replace).toHaveBeenCalledWith("/scriptorium");
  });

  it("deletes nothing when the delete is not confirmed", async () => {
    mocks.confirm.mockResolvedValue(false);
    const wrapper = open();
    await flushPromises();
    wrapper.findComponent(ScriptoriumBookSettings).vm.$emit("delete");
    await flushPromises();
    expect(mocks.deleteDoc).not.toHaveBeenCalled();
  });
});
