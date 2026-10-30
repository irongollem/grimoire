// @vitest-environment happy-dom
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, defineComponent, h, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ScriptoriumBookEditor from "./ScriptoriumBookEditor.vue";
import ScriptoriumBookSettings from "./ScriptoriumBookSettings.vue";
import { useAppUiStore } from "@/stores/ui/app";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

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
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useUpdateScriptoriumDocument: () => ({ mutateAsync: vi.fn() }),
  useDeleteScriptoriumDocument: () => ({ mutateAsync: mocks.deleteDoc }),
}));
vi.mock("@/composables/scriptorium/useScriptoriumChapters", () => ({
  useBookChapterList: () => ({ data: computed(() => mocks.list.value), isLoading: ref(false) }),
  useCreateChapter: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
  useScriptoriumChapter: (id: { value: string }) => ({
    data: computed(() => (id.value ? { id: id.value, document_id: "d1", content: { type: "doc", content: [] }, updated_at: "1", title: "", word_count: 0, position: 0, created_at: "" } : undefined)),
  }),
}));
vi.mock("@/composables/scriptorium/useScriptoriumPdf", () => ({
  useScriptoriumPdf: () => ({ isExporting: ref(false), exportError: ref(null), progress: ref(null), exportPdf: vi.fn() }),
}));
vi.mock("@/composables/scriptorium/useBookChapterHtml", () => ({
  useBookChapterHtml: () => ({
    chapters: () => [],
    version: ref(0),
    entityRefs: ref([]),
    fullQuery: { refetch: mocks.refetch },
  }),
}));
vi.mock("@/composables/scriptorium/useBookSettings", () => ({
  useBookSettings: () => ({
    draft: { title: "Sothery", kind: "book", theme: "onednd2024", pageSize: "A4", isTwoColumn: false, showPageNumbers: false, pageNumberStart: 1, footerText: "", inkFriendly: false, campaignId: null, furniture: [], isPublished: false, tags: [] },
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
  props: ["chapters", "currentId", "beforeLeave"],
  emits: ["select"],
  setup(props, { emit }) {
    return () =>
      h("div", { "data-testid": "rail" }, (props.chapters as { id: string }[]).map((c) =>
        h("button", { "data-testid": `go-${c.id}`, onClick: async () => { await props.beforeLeave(); emit("select", c.id); } }),
      ));
  },
});
const Editor = defineComponent({
  props: ["chapter"],
  setup(_p, { expose }) {
    expose({ saveNow: mocks.saveNow, hold: mocks.hold, release: vi.fn(), focusBlock: mocks.focusBlock, blockIdAtCursor: () => null, dirty: false });
    return () => h("div", { "data-testid": "chapter-editor-stub" });
  },
});
const Pane = defineComponent({
  emits: ["editBlock"],
  setup(_p, { emit }) {
    return () => h("button", { "data-testid": "pane", onClick: () => emit("editBlock", { chapterId: "c2", blockId: "b9" }) });
  },
});

const doc = { id: "d1", title: "Sothery", kind: "book", doc_type: "custom", campaign_id: null, ai_provenance: null } as unknown as ScriptoriumDocument;

function open() {
  return mount(ScriptoriumBookEditor, {
    props: { doc },
    global: {
      stubs: {
        ChapterRail: Rail,
        ScriptoriumChapterEditor: Editor,
        ScriptoriumPreviewPane: Pane,
        ScriptoriumBookHeader: true,
        ScriptoriumBookSettings: true,
        ScriptoriumExportDialog: true,
        FurnitureInspector: true,
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

  it("opens the chapter a clicked block belongs to", async () => {
    const wrapper = open();
    await flushPromises();
    await wrapper.find("[data-testid=pane]").trigger("click");
    await flushPromises();
    expect(mocks.saveNow).toHaveBeenCalled();
    expect(mocks.replace).toHaveBeenCalledWith({ query: { chapter: "c2" } });
  });

  it("stops the open chapter writing the moment the chapter list no longer holds it", async () => {
    open();
    await flushPromises();
    mocks.list.value = [{ id: "c2", title: "Two" }];
    await flushPromises();
    expect(mocks.hold).toHaveBeenCalled();
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
