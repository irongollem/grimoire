// @vitest-environment happy-dom
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { markRaw } from "vue";
// The Vue editor: node views drawn by Vue components need its renderer.
import { Editor, EditorContent } from "@tiptap/vue-3";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

async function open(attrs: Record<string, unknown>, editable = true) {
  const ed = new Editor({
    editable,
    extensions: createScriptoriumExtensions(),
    content: { type: "doc", content: [{ type: "coverPage", attrs: { variant: "front", title: "The Understage", ...attrs } }] },
  });
  editor = ed;
  const wrapper = mount(EditorContent, { props: { editor: markRaw(ed) }, attachTo: document.body });
  await flushPromises();
  return { ed, wrapper };
}

const coverAttrs = (ed: Editor) => ed.getJSON().content?.[0]?.attrs;

describe("CoverPageView", () => {
  // Fails on: the title being drawn but not typeable, or typing not reaching the cover's own attribute.
  it("writes what is typed in a field into the cover's attribute", async () => {
    const { ed, wrapper } = await open({});
    const title = wrapper.find<HTMLElement>('[data-field="title"]');
    expect(title.text()).toBe("The Understage");
    title.element.textContent = "The Understage Below";
    await title.trigger("input");
    expect(coverAttrs(ed)?.title).toBe("The Understage Below");
  });

  // Fails on: a pasted newline splitting a title across lines it cannot print on.
  it("folds a newline into a space", async () => {
    const { ed, wrapper } = await open({});
    const title = wrapper.find<HTMLElement>('[data-field="title"]');
    title.element.textContent = "One\nTwo";
    await title.trigger("input");
    expect(coverAttrs(ed)?.title).toBe("One Two");
  });

  // Fails on: an undo that changes the attribute leaving the old words showing on the cover.
  it("shows the words again when an undo changes the attribute", async () => {
    const { ed, wrapper } = await open({});
    ed.view.dispatch(ed.state.tr.setNodeMarkup(0, undefined, { ...ed.state.doc.firstChild!.attrs, title: "Changed" }));
    await flushPromises();
    expect(wrapper.find('[data-field="title"]').text()).toBe("Changed");
  });

  // Fails on: choosing where the title sits not redrawing the cover.
  it("is drawn again when the title is moved", async () => {
    const { ed, wrapper } = await open({ backgroundImage: "art.png" });
    const before = wrapper.find('[data-type="coverPage"]').html();
    ed.view.dispatch(ed.state.tr.setNodeMarkup(0, undefined, { ...ed.state.doc.firstChild!.attrs, titlePlace: "top" }));
    await flushPromises();
    expect(wrapper.find('[data-type="coverPage"]').html()).not.toBe(before);
    expect(wrapper.find('[data-type="coverPage"]').html()).toContain("justify-content: flex-start");
  });

  // Fails on: a read-only cover (the phone reader, a handout) being typeable.
  it("has no fields to type in when the editor is read only", async () => {
    const { wrapper } = await open({}, false);
    expect(wrapper.find("[data-field]").exists()).toBe(false);
    expect(wrapper.find('[data-type="coverPage"]').text()).toContain("The Understage");
  });
});
