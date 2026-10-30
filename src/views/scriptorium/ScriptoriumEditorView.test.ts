import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ref } from "vue";
import ScriptoriumEditorView from "./ScriptoriumEditorView.vue";

/*
 * The view itself only decides WHICH surface to show — the reader, the
 * "writing needs more room" explanation, or the desktop editor — based on
 * the route and the breakpoint. The three surfaces are stubbed out so this
 * only tests that decision, not their own internals (each has its own test
 * file: ScriptoriumReader.test.ts, and ScriptoriumEditor/TemplateGallery are
 * pre-existing and untouched by #915 story 7).
 */
const mockIsMobile = ref(false);
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()),
  useBelow: () => mockIsMobile,
}));

let mockRouteName = "scriptorium-editor";
vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => ({ name: mockRouteName, params: { id: "doc-1" } }),
  useRouter: () => ({ push: mockPush }),
}));
const mockPush = vi.fn();
vi.mock("@/composables/scriptorium/useScriptoriumChapters", () => ({
  useBookChapterList: () => ({ data: ref([{ id: "c1", title: "One" }]) }),
  useScriptoriumChapter: () => ({ data: ref(undefined), isLoading: ref(false) }),
}));

const mockDocData = ref<Record<string, unknown> | undefined>(undefined);
const mockIsLoading = ref(false);
let askedForId: { value: string } | undefined;
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useScriptoriumDocument: (id: { value: string }) => {
    askedForId = id;
    return { data: mockDocData, isLoading: mockIsLoading };
  },
}));

vi.mock("@/components/scriptorium/ScriptoriumReader.vue", () => ({
  default: { name: "ScriptoriumReader", props: ["book", "chapters", "chapter"], template: '<div data-testid="reader">reader</div>' },
}));
vi.mock("@/components/scriptorium/ScriptoriumBookEditor.vue", () => ({
  default: { name: "ScriptoriumBookEditor", props: ["doc"], template: '<div data-testid="editor">editor</div>' },
}));
vi.mock("@/components/scriptorium/TemplateGallery.vue", () => ({
  default: { name: "TemplateGallery", template: '<div data-testid="gallery">gallery</div>' },
}));

// The two phone EmptyStates link back to the list via AppButton's `to` prop,
// which mounts a real RouterLink — stubbed since no router is installed here.
function mountView() {
  return mount(ScriptoriumEditorView, { global: { stubs: { RouterLink: RouterLinkStub } } });
}

describe("ScriptoriumEditorView", () => {
  beforeEach(() => {
    mockIsMobile.value = false;
    mockRouteName = "scriptorium-editor";
    mockDocData.value = { id: "doc-1", title: "Test Doc", theme: "onednd2024", doc_type: "custom" };
    mockIsLoading.value = false;
  });

  it("renders the desktop editor at md and above", () => {
    const wrapper = mountView();
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="reader"]').exists()).toBe(false);
  });

  it("renders the reader below md for an existing, loaded document", () => {
    mockIsMobile.value = true;
    const wrapper = mountView();
    expect(wrapper.find('[data-testid="reader"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(false);
  });

  it("shows a loading spinner below md while the document is still loading", () => {
    mockIsMobile.value = true;
    mockDocData.value = undefined;
    mockIsLoading.value = true;
    const wrapper = mountView();
    expect(wrapper.find('[data-testid="reader"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
  });

  it("shows an unreadable-document state below md when loading finished with nothing", () => {
    mockIsMobile.value = true;
    mockDocData.value = undefined;
    mockIsLoading.value = false;
    const wrapper = mountView();
    expect(wrapper.text()).toContain("This document could not be read");
  });

  it("shows a 'writing needs more room' explanation for /scriptorium/new below md, never the editor", () => {
    mockIsMobile.value = true;
    mockRouteName = "scriptorium-new";
    const wrapper = mountView();
    expect(wrapper.text()).toContain("Writing needs more room");
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="reader"]').exists()).toBe(false);
  });

  it("still shows the template gallery for /scriptorium/new at md and above", () => {
    mockRouteName = "scriptorium-new";
    const wrapper = mountView();
    expect(wrapper.find('[data-testid="gallery"]').exists()).toBe(true);
  });

  it("an existing document opens in the book editor as itself", () => {
    const wrapper = mountView();
    const editor = wrapper.getComponent({ name: "ScriptoriumBookEditor" });
    expect(editor.props("doc")).toMatchObject({ id: "doc-1" });
    expect(askedForId?.value).toBe("doc-1");
  });

  it("a new document asks for no existing one and shows only the gallery, even with a stale read in the cache", () => {
    mockRouteName = "scriptorium-new";
    mockDocData.value = { id: "stale", title: "Stale", theme: "onednd2024", doc_type: "custom" };
    const wrapper = mountView();
    expect(askedForId?.value).toBe("");
    expect(wrapper.find('[data-testid="gallery"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(false);
  });

  it("opens the book the gallery made", () => {
    mockRouteName = "scriptorium-new";
    const wrapper = mountView();
    wrapper.getComponent({ name: "TemplateGallery" }).vm.$emit("created", "new-book");
    expect(mockPush).toHaveBeenCalledWith("/scriptorium/new-book");
  });

  it("an existing document that is still loading shows the spinner rather than an empty editor", () => {
    mockDocData.value = undefined;
    mockIsLoading.value = true;
    const wrapper = mountView();
    expect(wrapper.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
    expect(wrapper.find('[data-testid="editor"]').exists()).toBe(false);
  });
});
