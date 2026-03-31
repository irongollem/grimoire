/**
 * Minimal markdown → Tiptap JSON converter for paste handling.
 * Handles block-level syntax: headings, bullet/ordered lists, blockquotes, paragraphs.
 * Handles inline syntax: **bold**, *italic*, _italic_.
 */

type TiptapNode = Record<string, unknown>;
type TiptapMark = { type: string };
type TiptapText = { type: "text"; text: string; marks?: TiptapMark[] };

/** Returns true if the text contains markdown block-level patterns worth converting. */
export function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6} .+/m.test(text) ||
    /^[-*] .+/m.test(text) ||
    /^\d+\. .+/m.test(text) ||
    /^> .+/m.test(text);
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
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^#{1,6} |^[-*] |\d+\. |^> /.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) {
      nodes.push(paragraph(paraLines.join(" ")));
    }
  }

  return nodes.length ? nodes : [{ type: "paragraph" }];
}
