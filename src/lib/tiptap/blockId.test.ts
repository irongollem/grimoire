import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";

async function createEditor(content: string | object = "") {
  // Mounted (non-headless) editor: Tiptap v3 only emits `create` once a view
  // exists — and it emits it on the next tick — and BlockId assigns load-time
  // ids in onCreate. Same as the app, where EditorContent mounts the view.
  const instance = new Editor({
    element: document.createElement("div"),
    content,
    extensions: createScriptoriumExtensions(),
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return instance;
}

function collectBlockIds(editor: Editor): (string | null | undefined)[] {
  const ids: (string | null | undefined)[] = [];
  editor.state.doc.descendants((node) => {
    if ("blockId" in node.attrs) ids.push(node.attrs.blockId as string | null | undefined);
    return true;
  });
  return ids;
}

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe("BlockId extension", () => {
  it("assigns ids to all blocks on document load", async () => {
    editor = await createEditor("<h1>Chapter One</h1><p>Some text</p><p>More text</p>");
    const ids = collectBlockIds(editor);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    for (const id of ids) {
      expect(typeof id).toBe("string");
      expect(id).toBeTruthy();
    }
  });

  it("assigns unique ids", async () => {
    editor = await createEditor("<p>a</p><p>b</p><p>c</p><p>d</p>");
    const ids = collectBlockIds(editor);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns ids to newly inserted blocks", async () => {
    editor = await createEditor("<p>start</p>");
    editor.commands.insertContentAt(editor.state.doc.content.size, "<p>inserted</p>");
    const ids = collectBlockIds(editor);
    expect(ids.length).toBe(2);
    expect(ids.every((id) => typeof id === "string" && id)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it("re-keys duplicated ids when content is pasted twice", async () => {
    editor = await createEditor("<p>original</p>");
    const original = editor.getJSON();
    const firstId = original.content?.[0]?.attrs?.blockId as string;
    expect(firstId).toBeTruthy();
    // Insert a copy of the same node (same blockId) — paste/duplicate scenario
    editor.commands.insertContentAt(
      editor.state.doc.content.size,
      original.content![0],
    );
    const ids = collectBlockIds(editor);
    expect(ids.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("survives a JSON round-trip", async () => {
    editor = await createEditor("<h2>Heading</h2><p>body</p>");
    const json = editor.getJSON();
    const ids = collectBlockIds(editor);
    editor.destroy();
    editor = await createEditor(json);
    expect(collectBlockIds(editor)).toEqual(ids);
  });

  it("renders data-block-id into HTML output", async () => {
    editor = await createEditor("<p>hello</p>");
    expect(editor.getHTML()).toMatch(/data-block-id="[0-9a-f-]{36}"/);
  });
});
