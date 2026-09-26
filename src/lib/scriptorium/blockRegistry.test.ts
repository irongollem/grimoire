import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { BLOCK_REGISTRY, BLOCK_GROUP_ORDER } from "./blockRegistry";

/** Depth-first search for a node of `type` anywhere in the document. */
function hasNodeOfType(node: JSONContent, type: string): boolean {
  if (node.type === type) return true;
  return (node.content ?? []).some((child) => hasNodeOfType(child, type));
}

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
  vi.unstubAllGlobals();
});

function makeEditor(): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    content: { type: "doc", content: [{ type: "paragraph" }] },
    extensions: createScriptoriumExtensions(),
  });
  editors.push(editor);
  return editor;
}

describe("BLOCK_REGISTRY", () => {
  it("every entry's group is listed in BLOCK_GROUP_ORDER", () => {
    for (const entry of BLOCK_REGISTRY) {
      expect(BLOCK_GROUP_ORDER, `"${entry.label}" has an unlisted group "${entry.group}"`).toContain(
        entry.group,
      );
    }
  });

  it("every entry has a non-empty label and description", () => {
    for (const entry of BLOCK_REGISTRY) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.description.trim()).not.toBe("");
    }
  });

  // The martial-table entry prompts for a column name; stub it so the suite
  // stays headless. Every other action-bearing entry runs as-is.
  const actionEntries = BLOCK_REGISTRY.filter((e) => e.action);

  it.each(actionEntries.map((e) => [e.label, e] as const))(
    '"%s" produces a valid schema document without throwing',
    (_label, entry) => {
      vi.stubGlobal("prompt", () => "Ki Points");
      const editor = makeEditor();
      expect(() => entry.action!(editor)).not.toThrow();
      const json = editor.getJSON();
      expect(json.type).toBe("doc");
      expect(editor.getHTML().length).toBeGreaterThan(0);
    },
  );

  it('"Page Break" inserts the dedicated pageBreak node, not a legacy horizontalRule', () => {
    const entry = BLOCK_REGISTRY.find((e) => e.label === "Page Break")!;
    const editor = makeEditor();
    entry.action!(editor);
    const types = (editor.getJSON().content ?? []).map((n) => n.type);
    expect(types).toContain("pageBreak");
    expect(types).not.toContain("horizontalRule");
  });

  it('"Front Cover" inserts a coverPage node', () => {
    const entry = BLOCK_REGISTRY.find((e) => e.label === "Front Cover")!;
    const editor = makeEditor();
    entry.action!(editor);
    expect((editor.getJSON().content ?? []).some((n) => n.type === "coverPage")).toBe(true);
  });

  it('"Table of Contents" inserts a tocBlock node', () => {
    const entry = BLOCK_REGISTRY.find((e) => e.label === "Table of Contents")!;
    const editor = makeEditor();
    entry.action!(editor);
    expect((editor.getJSON().content ?? []).some((n) => n.type === "tocBlock")).toBe(true);
  });

  it('"Note" toggles a noteBlock wrapper around the current block', () => {
    const entry = BLOCK_REGISTRY.find((e) => e.label === "Note")!;
    const editor = makeEditor();
    entry.action!(editor);
    expect((editor.getJSON().content ?? []).some((n) => n.type === "noteBlock")).toBe(true);
  });

  it('"Attribution" is only meaningful inside a quoteBlock — enabled() reflects that', () => {
    const entry = BLOCK_REGISTRY.find((e) => e.label === "Attribution")!;
    const editor = makeEditor();
    expect(entry.enabled!(editor)).toBe(false);
    editor.chain().focus().toggleQuoteBlock().run();
    expect(entry.enabled!(editor)).toBe(true);
    entry.action!(editor);
    // The attribution lands inside the quoteBlock it was toggled into, not at
    // the top level — search the whole tree.
    expect(hasNodeOfType(editor.getJSON(), "attribution")).toBe(true);
  });

  it('"Column Break" is enabled only when isTwoColumn is passed via ctx', () => {
    const entry = BLOCK_REGISTRY.find((e) => e.label === "Column Break")!;
    const editor = makeEditor();
    expect(entry.enabled!(editor, { isTwoColumn: false })).toBe(false);
    expect(entry.enabled!(editor, { isTwoColumn: true })).toBe(true);
  });

  it('"Class Table — Martial" prompts for a column name and inserts a table', () => {
    vi.stubGlobal("prompt", () => "Sneak Attack");
    const entry = BLOCK_REGISTRY.find((e) => e.label === "Class Table — Martial")!;
    const editor = makeEditor();
    entry.action!(editor);
    const html = editor.getHTML();
    expect(html).toContain("Sneak Attack");
  });

  it('"Class Table — Martial" inserts nothing when the prompt is cancelled', () => {
    vi.stubGlobal("prompt", () => null);
    const entry = BLOCK_REGISTRY.find((e) => e.label === "Class Table — Martial")!;
    const editor = makeEditor();
    const before = editor.getHTML();
    entry.action!(editor);
    expect(editor.getHTML()).toBe(before);
  });

  it("decoration entries carry a furnitureKind and no action", () => {
    const decorations = BLOCK_REGISTRY.filter((e) => e.group === "Decoration");
    expect(decorations.length).toBeGreaterThan(0);
    for (const d of decorations) {
      expect(d.furnitureKind).toBeTruthy();
      expect(d.action).toBeUndefined();
    }
  });
});
