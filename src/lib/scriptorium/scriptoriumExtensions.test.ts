import { describe, it, expect, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "./scriptoriumExtensions";

let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

function makeEditor(content: JSONContent): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    content,
    extensions: createScriptoriumExtensions(),
  });
  editors.push(editor);
  return editor;
}

/** Tiptap's core Editor fires its "create" event from a `window.setTimeout(…, 0)`
 *  inside `mount()`, not synchronously from the constructor — and BlockId's
 *  initial-id assignment (`onCreate`) runs from that event. A test that reads
 *  `getJSON()` straight after construction sees every blockId still `null`. */
function flushCreate(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadedJson(content: JSONContent): Promise<JSONContent> {
  const editor = makeEditor(content);
  await flushCreate();
  return editor.getJSON();
}

/** blockId is assigned fresh on every load (BlockId's onCreate) — the one
 *  field a round trip is allowed to change. Strip it recursively so the rest
 *  of the comparison is exact. */
function stripBlockId(node: JSONContent): JSONContent {
  const { attrs, content, ...rest } = node;
  const nextAttrs = attrs ? { ...attrs } : undefined;
  if (nextAttrs && "blockId" in nextAttrs) delete nextAttrs.blockId;
  return {
    ...rest,
    ...(nextAttrs ? { attrs: nextAttrs } : {}),
    ...(content ? { content: content.map(stripBlockId) } : {}),
  };
}

// One document exercising every node type createScriptoriumExtensions()
// registers (StarterKit's block nodes, every custom src/lib/tiptap/* node,
// the table family, and entityEmbed). Attrs are left at their schema
// defaults except where a node has no meaningful default (entityEmbed,
// coverPage's variant) — Tiptap fills every other default in on load, so a
// hand-written "expected" JSON would have to duplicate the whole schema to
// stay correct. Comparing two successive loads of the SAME content sidesteps
// that: whatever the schema defaults to, it must default to the same thing
// twice.
const DOCUMENT: JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Title" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Some " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " and " },
        { type: "spacerHorizontal" },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: "." },
      ],
    },
    { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quoted." }] }] },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] }],
    },
    {
      type: "orderedList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] }],
    },
    { type: "codeBlock", content: [{ type: "text", text: "const x = 1;" }] },
    { type: "horizontalRule" },
    { type: "image", attrs: { src: "https://example.com/art.webp", alt: "Art" } },
    { type: "spacerVertical" },
    { type: "watercolor" },
    { type: "watermark" },
    { type: "artistCredit" },
    { type: "columnBreak" },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [{ type: "text", text: "Head" }] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [{ type: "text", text: "Cell" }] }] },
          ],
        },
      ],
    },
    { type: "skipCounting" },
    { type: "resetCounting" },
    { type: "wideBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "Wide." }] }] },
    { type: "noteBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "A note." }] }] },
    {
      type: "descriptiveBlock",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Descriptive." }] }],
    },
    {
      type: "quoteBlock",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "A famous line." }] },
        { type: "attribution", content: [{ type: "text", text: "Someone Important" }] },
      ],
    },
    { type: "tocBlock" },
    { type: "coverPage", attrs: { variant: "part" } },
    { type: "pageBreak" },
    { type: "entityEmbed", attrs: { entityType: "npc", entityId: "npc-123" } },
  ],
};

describe("createScriptoriumExtensions — full round trip", () => {
  it("round-trips a document holding every node type, modulo blockId", async () => {
    const first = await loadedJson(DOCUMENT);
    const strippedFirst = stripBlockId(first);

    const second = await loadedJson(strippedFirst);
    const strippedSecond = stripBlockId(second);

    expect(strippedSecond).toEqual(strippedFirst);
  });

  it("assigns a blockId to every typed block on load", async () => {
    const json = await loadedJson(DOCUMENT);
    const blockIdTypes = new Set([
      "paragraph",
      "heading",
      "blockquote",
      "bulletList",
      "orderedList",
      "codeBlock",
      "table",
      "image",
      "wideBlock",
      "noteBlock",
      "descriptiveBlock",
      "quoteBlock",
      "tocBlock",
      "coverPage",
      "watermark",
      "artistCredit",
      "spacerVertical",
      "entityEmbed",
    ]);
    const missing: string[] = [];
    function walk(node: JSONContent) {
      if (blockIdTypes.has(node.type ?? "") && !node.attrs?.blockId) missing.push(node.type ?? "?");
      node.content?.forEach(walk);
    }
    (json.content ?? []).forEach(walk);
    expect(missing).toEqual([]);
  });

  it("does not lose the entityEmbed node's attrs on reload", () => {
    const json = makeEditor(DOCUMENT).getJSON();
    const embed = (json.content ?? []).find((n) => n.type === "entityEmbed");
    expect(embed?.attrs).toMatchObject({ entityType: "npc", entityId: "npc-123" });
  });
});
