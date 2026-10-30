/*
 * A template (or an imported markdown file) builds ONE Tiptap document; a book
 * is chapters (#1115). The document is cut before every top-level level-1
 * heading, so each chapter opens with the heading that names it. Whatever comes
 * before the first heading (a cover, the contents) stays at the head of the
 * first chapter. A page break left dangling at a chapter's end is dropped: the
 * next chapter starts on its own page anyway, and the break would print a blank.
 */
import type { JSONContent } from "@tiptap/core";

function isChapterHeading(node: JSONContent): boolean {
  return node.type === "heading" && node.attrs?.level === 1;
}

export function splitIntoChapters(doc: JSONContent): { content: JSONContent }[] {
  const nodes = doc.content ?? [];
  const groups: JSONContent[][] = [[]];
  nodes.forEach((node) => {
    const current = groups[groups.length - 1];
    // A heading opens a new chapter unless the chapter so far has no heading of its own yet.
    if (isChapterHeading(node) && current.some(isChapterHeading)) groups.push([node]);
    else current.push(node);
  });
  return groups.map((group) => {
    const trimmed = [...group];
    while (trimmed.length > 1 && trimmed[trimmed.length - 1].type === "pageBreak") trimmed.pop();
    return { content: { type: "doc", content: trimmed } };
  });
}
