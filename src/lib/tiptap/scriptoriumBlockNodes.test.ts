/*
 * Table-driven parseHTML/renderHTML round-trip coverage for every Scriptorium
 * node that had none (#915 story 2 test-gap pass). One file rather than one
 * per node: each case is a single serialize → parse → compare, and the nodes
 * share nothing but the schema they're registered in.
 *
 * generateHTML/generateJSON are pure (@tiptap/core) — no Editor instance, no
 * appendTransaction/onCreate side effects (BlockId's id assignment among
 * them), so this tests renderHTML/parseHTML in isolation from the rest of the
 * extension stack.
 */
import { describe, it, expect } from "vitest";
import { generateHTML, generateJSON } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";

const EXT = createScriptoriumExtensions();

function doc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}
function para(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

/** Depth-first search for the first node of `type`. */
function findNode(node: JSONContent, type: string): JSONContent | undefined {
  if (node.type === type) return node;
  for (const child of node.content ?? []) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return undefined;
}

function roundTrip(original: JSONContent): JSONContent {
  const html = generateHTML(original, EXT);
  return generateJSON(html, EXT) as JSONContent;
}

interface Case {
  label: string;
  type: string;
  build: () => JSONContent;
  expectAttrs?: Record<string, unknown>;
  expectChildTypes?: string[];
}

const CASES: Case[] = [
  {
    label: "wideBlock wraps its block content",
    type: "wideBlock",
    build: () => doc([{ type: "wideBlock", content: [para("Wide content")] }]),
    expectChildTypes: ["paragraph"],
  },
  {
    label: "noteBlock wraps its block content",
    type: "noteBlock",
    build: () => doc([{ type: "noteBlock", content: [para("A note")] }]),
    expectChildTypes: ["paragraph"],
  },
  {
    label: "descriptiveBlock wraps its block content",
    type: "descriptiveBlock",
    build: () => doc([{ type: "descriptiveBlock", content: [para("Read aloud")] }]),
    expectChildTypes: ["paragraph"],
  },
  {
    label: "quoteBlock holds a paragraph and an attribution",
    type: "quoteBlock",
    build: () =>
      doc([
        {
          type: "quoteBlock",
          content: [para("A famous line."), { type: "attribution", content: [{ type: "text", text: "Someone" }] }],
        },
      ]),
    expectChildTypes: ["paragraph", "attribution"],
  },
  {
    label: "attribution round-trips its text inside a quoteBlock",
    type: "attribution",
    build: () =>
      doc([
        {
          type: "quoteBlock",
          content: [para("Line."), { type: "attribution", content: [{ type: "text", text: "Author Name" }] }],
        },
      ]),
  },
  {
    label: "tocBlock is a contentless atom",
    type: "tocBlock",
    build: () => doc([{ type: "tocBlock" }]),
  },
  {
    label: "columnBreak is a contentless atom",
    type: "columnBreak",
    build: () => doc([para("a"), { type: "columnBreak" }, para("b")]),
  },
  {
    label: "skipCounting is a contentless atom",
    type: "skipCounting",
    build: () => doc([{ type: "skipCounting" }]),
  },
  {
    label: "resetCounting is a contentless atom",
    type: "resetCounting",
    build: () => doc([{ type: "resetCounting" }]),
  },
  {
    label: "spacerVertical preserves its height attribute",
    type: "spacerVertical",
    build: () => doc([{ type: "spacerVertical", attrs: { height: 32 } }]),
    expectAttrs: { height: 32 },
  },
  {
    label: "spacerVertical falls back to its default height",
    type: "spacerVertical",
    build: () => doc([{ type: "spacerVertical" }]),
    expectAttrs: { height: 16 },
  },
  {
    label: "spacerHorizontal preserves its width attribute inline",
    type: "spacerHorizontal",
    build: () => doc([{ type: "paragraph", content: [{ type: "text", text: "a " }, { type: "spacerHorizontal", attrs: { width: 64 } }, { type: "text", text: " b" }] }]),
    expectAttrs: { width: 64 },
  },
  {
    label: "scriptoriumImage inline mode preserves src/width/align",
    type: "image",
    build: () =>
      doc([
        {
          type: "image",
          attrs: { src: "https://example.com/a.webp", width: "220", dataAlign: "left", layoutMode: "inline" },
        },
      ]),
    expectAttrs: { src: "https://example.com/a.webp", width: "220", dataAlign: "left", layoutMode: "inline" },
  },
  {
    label: "scriptoriumImage absolute mode preserves position offsets",
    type: "image",
    build: () =>
      doc([
        {
          type: "image",
          attrs: {
            src: "https://example.com/b.webp",
            width: "300",
            layoutMode: "absolute",
            posTop: "40px",
            posLeft: "20px",
          },
        },
      ]),
    expectAttrs: { src: "https://example.com/b.webp", layoutMode: "absolute", posTop: "40px", posLeft: "20px" },
  },
];

describe("Scriptorium node parseHTML/renderHTML round trips", () => {
  it.each(CASES.map((c) => [c.label, c] as const))("%s", (_label, { type, build, expectAttrs, expectChildTypes }) => {
    const original = build();
    const after = roundTrip(original);
    const node = findNode(after, type);
    expect(node, `expected a "${type}" node to survive the round trip`).toBeDefined();
    if (expectAttrs) expect(node!.attrs).toMatchObject(expectAttrs);
    if (expectChildTypes) expect((node!.content ?? []).map((n) => n.type)).toEqual(expectChildTypes);
  });
});
