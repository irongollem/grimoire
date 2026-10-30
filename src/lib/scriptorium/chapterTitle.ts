import type { JSONContent } from "@tiptap/core";

/** The text inside a node, depth first. Nodes without text (images, rules) add nothing. */
function textOf(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  if (!node.content) return "";
  return node.content.map(textOf).join("");
}

/**
 * A chapter's title: the trimmed text of the first TOP-LEVEL heading, or ""
 * when it has none. A heading inside a secret block, lens pair or any other
 * wrapper is that block's own and never names the chapter.
 */
export function chapterTitle(doc: JSONContent): string {
  const heading = doc.content?.find((node) => node.type === "heading");
  return heading ? textOf(heading).trim() : "";
}

/** Block nodes whose text must not run into the next block's first word. */
const BLOCK_BREAKS = new Set(["paragraph", "heading", "listItem", "tableCell", "tableHeader", "blockquote"]);

function collectWords(node: JSONContent, out: string[]): void {
  if (typeof node.text === "string") out.push(node.text);
  node.content?.forEach((child) => collectWords(child, out));
  if (node.type && BLOCK_BREAKS.has(node.type)) out.push("\n");
}

/** Whitespace-separated words in a Tiptap document, the figure `word_count` stores. */
export function countWords(doc: JSONContent): number {
  const parts: string[] = [];
  collectWords(doc, parts);
  const text = parts.join("").trim();
  return text ? text.split(/\s+/).length : 0;
}
