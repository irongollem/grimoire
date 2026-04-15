/**
 * Minimal markdown → Tiptap JSON converter for paste handling.
 * Handles block-level syntax: headings, bullet/ordered lists, blockquotes, paragraphs.
 * Handles inline syntax: **bold**, *italic*, _italic_.
 */

type TiptapNode = Record<string, unknown>;
type TiptapMark = { type: string };
type TiptapText = { type: "text"; text: string; marks?: TiptapMark[] };

/** Strip invisible/special characters that PDFs embed (soft hyphens, zero-width spaces, etc.) */
export function sanitizePasteText(text: string): string {
  return text
    .replace(/\u00AD/g, "")    // soft hyphen
    .replace(/\u200B/g, "")    // zero-width space
    .replace(/\u200C/g, "")    // zero-width non-joiner
    .replace(/\u200D/g, "")    // zero-width joiner
    .replace(/\uFEFF/g, "")    // BOM / zero-width no-break space
    .replace(/\u00A0/g, " ");  // non-breaking space → regular space
}

/** Returns true if the text contains markdown block-level patterns worth converting.
 *  Requires at least 2 matching lines or a heading to avoid treating normal prose
 *  (e.g. a sentence that happens to start with "15.") as markdown. */
export function looksLikeMarkdown(text: string): boolean {
  if (/^#{1,6} .+/m.test(text)) return true;  // any heading = intentional markdown
  if (/^> .+/m.test(text)) return true;         // blockquote = intentional markdown

  // Lists only count if there are at least 2 consecutive list items —
  // avoids treating "15. On a success…" (PDF line-break mid-sentence) as a list.
  if (/^[-*] .+\n[-*] .+/m.test(text)) return true;
  if (/^\d+\. .+\n\d+\. .+/m.test(text)) return true;

  return false;
}

function inlineContent(text: string): TiptapText[] {
  const result: TiptapText[] = [];
  // Match **bold**, *italic*, or _italic_ spans
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|_([^_]+)_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      result.push({ type: "text", text: text.slice(last, match.index) });
    }
    if (match[0].startsWith("**")) {
      result.push({ type: "text", marks: [{ type: "bold" }], text: match[2] });
    } else {
      result.push({ type: "text", marks: [{ type: "italic" }], text: match[3] ?? match[4] });
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) result.push({ type: "text", text: text.slice(last) });
  return result.length ? result : [{ type: "text", text: "" }];
}

function paragraph(text: string): TiptapNode {
  return { type: "paragraph", content: inlineContent(text) };
}

/** Parse markdown text into a Tiptap content array (children of a doc node). */
export function parseMarkdown(text: string): TiptapNode[] {
  const lines = text.split("\n");
  const nodes: TiptapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings
    const headingMatch = line.match(/^(#{1,6}) (.+)/);
    if (headingMatch) {
      nodes.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: inlineContent(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push({ type: "blockquote", content: [paragraph(line.slice(2))] });
      i++;
      continue;
    }

    // Bullet list — collect consecutive items
    if (/^[-*] /.test(line)) {
      const items: TiptapNode[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push({ type: "listItem", content: [paragraph(lines[i].slice(2))] });
        i++;
      }
      nodes.push({ type: "bulletList", content: items });
      continue;
    }

    // Ordered list — collect consecutive items
    if (/^\d+\. /.test(line)) {
      const items: TiptapNode[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push({ type: "listItem", content: [paragraph(lines[i].replace(/^\d+\. /, ""))] });
        i++;
      }
      nodes.push({ type: "orderedList", attrs: { start: 1 }, content: items });
      continue;
    }

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect until blank line or block element
    // NOTE: all patterns must be anchored with ^ to match the outer if-branches,
    // otherwise a mid-line "15." stops collection but i never advances → infinite loop.
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6} |^[-*] |^\d+\. |^> /.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    // Safety: if nothing was collected and i didn't advance, force progress to
    // avoid an infinite loop on lines that don't match any branch.
    if (!paraLines.length) { i++; continue; }
    if (paraLines.length) {
      nodes.push(paragraph(paraLines.join(" ")));
    }
  }

  return nodes.length ? nodes : [{ type: "paragraph" }];
}
