import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { fullCasterTable, halfCasterTable, thirdCasterTable, martialTable } from "./classTableTemplates";

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

function mount(content: object): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    content: { type: "doc", content: [content] },
    extensions: createScriptoriumExtensions(),
  });
  editors.push(editor);
  return editor;
}

/** Every table has 20 level rows plus one header row. */
function tableRows(json: JSONContent): JSONContent[] {
  const wide = (json.content ?? [])[0];
  const table = (wide.content ?? [])[0];
  return table.content ?? [];
}

describe("class progression table templates", () => {
  it.each([
    ["fullCasterTable", fullCasterTable, 13],
    ["halfCasterTable", halfCasterTable, 8],
    ["thirdCasterTable", thirdCasterTable, 7],
  ] as const)("%s wraps a 21-row table (header + 20 levels) with %d columns", (_name, factory, colCount) => {
    const editor = mount(factory());
    const json = editor.getJSON();
    expect((json.content ?? [])[0]?.type).toBe("wideBlock");
    const rows = tableRows(json);
    expect(rows).toHaveLength(21);
    expect(rows[0].type).toBe("tableRow");
    expect((rows[0].content ?? [])).toHaveLength(colCount);
    // Every data row has the same column count as the header.
    for (const row of rows.slice(1)) {
      expect((row.content ?? [])).toHaveLength(colCount);
    }
  });

  it("martialTable uses the given custom column name in its header", () => {
    const editor = mount(martialTable("Ki Points"));
    expect(editor.getHTML()).toContain("Ki Points");
    const rows = tableRows(editor.getJSON());
    expect(rows).toHaveLength(21);
  });
});
