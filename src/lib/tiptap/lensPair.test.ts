// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor, generateHTML, generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { LENS_PAIR_EXTENSIONS, BRIGHT_PLACEHOLDER, DEEP_PLACEHOLDER } from "./lensPair";

vi.mock("@/components/scriptorium/LensPairView.vue", () => ({ default: {} }));

const EXT = [StarterKit, ...LENS_PAIR_EXTENSIONS];

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

function makeEditor(content?: JSONContent): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: EXT,
    content: content ?? { type: "doc", content: [{ type: "paragraph" }] },
  });
  editors.push(editor);
  return editor;
}

const para = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const pair = (bright: JSONContent[], deep: JSONContent[], variant = "boxed"): JSONContent => ({
  type: "lensPair",
  attrs: { variant },
  content: [
    { type: "lensBright", content: bright },
    { type: "lensDeep", content: deep },
  ],
});
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

describe("lens pair markup", () => {
  it("renders the pair with labelled halves and a body per half", () => {
    const html = generateHTML(doc(pair([para("kind")], [para("grim")])), EXT);
    expect(html).toContain('data-type="lensPair"');
    expect(html).toContain('class="sc-lens"');
    expect(html).toContain('data-type="lensBright"');
    expect(html).toContain('data-type="lensDeep"');
    expect(html).toContain(">Bright<");
    expect(html).toContain(">Deep<");
    expect(html.indexOf("lensBright")).toBeLessThan(html.indexOf("lensDeep"));
  });

  it("marks the light variant with a class", () => {
    const html = generateHTML(doc(pair([para("a")], [para("b")], "light")), EXT);
    expect(html).toContain("sc-lens sc-lens--light");
  });

  it("round-trips through HTML without turning the labels into document text", () => {
    const original = doc(pair([para("kind")], [para("grim")], "light"));
    const back = generateJSON(generateHTML(original, EXT), EXT);
    expect(back).toEqual(original);
  });
});

describe("insertLensPair", () => {
  it("inserts a boxed pair with two empty halves, Bright first", () => {
    const editor = makeEditor();
    expect(editor.commands.insertLensPair()).toBe(true);
    const found = editor.getJSON().content?.find((n) => n.type === "lensPair");
    expect(found?.attrs).toEqual({ variant: "boxed" });
    expect(found?.content?.map((n) => n.type)).toEqual(["lensBright", "lensDeep"]);
  });

  it("never nests a pair inside a half", () => {
    const editor = makeEditor(doc(pair([para("x")], [para("y")])));
    editor.commands.setTextSelection(4);
    expect(editor.commands.insertLensPair()).toBe(false);
    let nested = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "lensBright" || node.type.name === "lensDeep") {
        node.descendants((child) => {
          if (child.type.name === "lensPair") nested = true;
        });
      }
    });
    expect(nested).toBe(false);
  });
});

describe("fixed structure", () => {
  it("does not let one half be deleted on its own", () => {
    const editor = makeEditor(doc(pair([para("x")], [para("y")])));
    const deepFrom = editor.state.doc.firstChild!.child(0).nodeSize + 1;
    editor.view.dispatch(editor.state.tr.delete(deepFrom, deepFrom + editor.state.doc.firstChild!.child(1).nodeSize));
    const kinds = editor.getJSON().content?.[0].content?.map((n) => n.type);
    expect(kinds === undefined || kinds.join() === "lensBright,lensDeep").toBe(true);
  });

  it("repairs a pair parsed without its Deep half", () => {
    const parsed = generateJSON(
      '<div data-type="lensPair"><div data-type="lensBright"><div class="sc-lens-body"><p>only</p></div></div></div>',
      EXT,
    );
    const editor = makeEditor(parsed);
    const pairNode = editor.getJSON().content?.find((n) => n.type === "lensPair");
    expect(pairNode?.content?.map((n) => n.type)).toEqual(["lensBright", "lensDeep"]);
  });
});

describe("placeholders", () => {
  it("hints each empty half, and only while it is empty", () => {
    const editor = makeEditor(doc(pair([{ type: "paragraph" }], [para("filled")])));
    const dom = editor.view.dom as HTMLElement;
    expect(dom.querySelector('[data-type="lensBright"] p.is-empty')?.getAttribute("data-placeholder")).toBe(BRIGHT_PLACEHOLDER);
    expect(dom.querySelector('[data-type="lensDeep"] p.is-empty')).toBeNull();
    editor.commands.setContent(doc(pair([para("filled")], [{ type: "paragraph" }])));
    expect(dom.querySelector('[data-type="lensDeep"] p.is-empty')?.getAttribute("data-placeholder")).toBe(DEEP_PLACEHOLDER);
  });
});
