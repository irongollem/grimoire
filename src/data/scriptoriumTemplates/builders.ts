/*
 * Tiny JSONContent node builders for authoring Scriptorium templates by hand.
 * Keep these dumb and composable — they just shape Tiptap node objects.
 */

import type { JSONContent } from "@tiptap/core";

export const text = (t: string): JSONContent => ({ type: "text", text: t });
export const strong = (t: string): JSONContent => ({ type: "text", marks: [{ type: "bold" }], text: t });
export const em = (t: string): JSONContent => ({ type: "text", marks: [{ type: "italic" }], text: t });

/** Paragraph from inline parts; bare strings become text nodes. Empty = blank line. */
export const p = (...inline: (JSONContent | string)[]): JSONContent => ({
  type: "paragraph",
  ...(inline.length
    ? { content: inline.map((i) => (typeof i === "string" ? text(i) : i)) }
    : {}),
});

export const heading = (level: 1 | 2 | 3, t: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [text(t)],
});
export const h1 = (t: string) => heading(1, t);
export const h2 = (t: string) => heading(2, t);
export const h3 = (t: string) => heading(3, t);

export const bullets = (...items: string[]): JSONContent => ({
  type: "bulletList",
  content: items.map((t) => ({ type: "listItem", content: [p(t)] })),
});

export const pageBreak = (): JSONContent => ({ type: "pageBreak" });
export const toc = (): JSONContent => ({ type: "tocBlock" });

/** Note / read-aloud callouts need ≥1 block child (content: "block+"). */
export const note = (...blocks: JSONContent[]): JSONContent => ({ type: "noteBlock", content: blocks });
export const descriptive = (...blocks: JSONContent[]): JSONContent => ({
  type: "descriptiveBlock",
  content: blocks,
});

export const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
