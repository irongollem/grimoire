// @vitest-environment happy-dom
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { markRaw } from "vue";
// The Vue editor: node views drawn by Vue components need its renderer.
import { Editor, EditorContent } from "@tiptap/vue-3";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { PRINTED_BOOK_KEY, createPrintedBook } from "@/scriptorium/composables/usePrintedBook";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

async function open(editable: boolean) {
  const ed = new Editor({ editable, extensions: createScriptoriumExtensions(), content: { type: "doc", content: [{ type: "tocBlock" }] } });
  editor = ed;
  const book = createPrintedBook();
  const wrapper = mount(EditorContent, {
    props: { editor: markRaw(ed) },
    global: { provide: { [PRINTED_BOOK_KEY as symbol]: book } },
    attachTo: document.body,
  });
  await flushPromises();
  return { book, wrapper };
}

describe("ContentsView", () => {
  // Fails on: the contents page in the editor not showing the list the layout printed, or not following it as the book changes.
  it("draws the printed contents and follows a new layout", async () => {
    const { book, wrapper } = await open(true);
    expect(wrapper.find("nav[data-type=toc]").text()).toContain("No headings yet.");
    book.contents.value = '<h2 class="sc-toc-heading">Contents</h2><ol class="sc-toc-list"><li class="sc-toc-item">Intro</li></ol>';
    await flushPromises();
    expect(wrapper.find("nav[data-type=toc]").text()).toContain("Intro");
    expect(wrapper.find("nav[data-type=toc]").classes()).toContain("sc-toc");
  });

  // Fails on: the phone reader (read only) drawing a second contents list over its own tappable one.
  it("stays the empty placeholder when the editor is read only", async () => {
    const { book, wrapper } = await open(false);
    book.contents.value = '<ol class="sc-toc-list"><li>Intro</li></ol>';
    await flushPromises();
    const nav = wrapper.find("nav[data-type=toc]");
    expect(nav.classes()).toContain("sc-toc-placeholder");
    expect(nav.text()).toBe("");
  });
});
