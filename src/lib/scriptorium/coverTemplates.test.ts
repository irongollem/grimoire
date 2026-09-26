import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import {
  frontCoverTemplate,
  insideCoverTemplate,
  partDividerTemplate,
  backCoverTemplate,
  type CoverPageJSON,
} from "./coverTemplates";

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

function mount(content: CoverPageJSON): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    content: { type: "doc", content },
    extensions: createScriptoriumExtensions(),
  });
  editors.push(editor);
  return editor;
}

describe("cover page templates", () => {
  it.each([
    ["frontCoverTemplate", frontCoverTemplate, "front"],
    ["insideCoverTemplate", insideCoverTemplate, "inside"],
    ["partDividerTemplate", partDividerTemplate, "part"],
    ["backCoverTemplate", backCoverTemplate, "back"],
  ] as const)("%s loads as a coverPage node with variant %s", (_name, factory, variant) => {
    const editor = mount(factory());
    const node = (editor.getJSON().content ?? [])[0];
    expect(node?.type).toBe("coverPage");
    expect(node?.attrs?.variant).toBe(variant);
  });

  it("accepts overrides for its fields", () => {
    const editor = mount(frontCoverTemplate({ title: "My Title", subtitle: "My Subtitle" }));
    const node = (editor.getJSON().content ?? [])[0];
    expect(node?.attrs?.title).toBe("My Title");
    expect(node?.attrs?.subtitle).toBe("My Subtitle");
  });

  it("each factory returns a fresh array on every call", () => {
    const a = frontCoverTemplate();
    const b = frontCoverTemplate();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
