/**
 * Markdown → Tiptap JSON entry points for paste handling, AI output and
 * stored library text. The conversion itself lives in `markdownDocument.ts`
 * (one Markdown reader for the whole app, also used by the archive import);
 * this module keeps the callers' API and the paste-specific heuristics
 * (`looksLikeMarkdown`, `sanitizePasteText`, `storedTextToDoc`).
 */
import { markdownToInlineNodes, markdownToTiptapNodes, type TiptapNode } from "./markdownDocument";

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

/** Parse markdown text into a Tiptap content array (children of a doc node). */
export function parseMarkdown(text: string): TiptapNode[] {
  const nodes = markdownToTiptapNodes(text);
  return nodes.length ? nodes : [{ type: "paragraph" }];
}

/**
 * Convert a markdown string to a Tiptap JSON string ({"type":"doc",...}).
 * Handles headings, paragraphs, lists, blockquotes, and markdown tables.
 */
export function markdownToTiptapJson(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: parseMarkdown(text),
  });
}


/**
 * Convert plain text (with optional markdown headings) to a minimal Tiptap
 * JSON string. Lines starting with "# " become level-1, "## " level-2, etc.
 * Everything else is a paragraph. Double newlines separate blocks.
 * (AI generators don't emit markdown tables; use markdownToTiptapJson for
 * that.) Pure — safe for both browser and Node/tsx seed-script use.
 */
export function toTiptapJson(text: string): string {
  const blocks = text
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean)
    .flatMap((b) => {
      const match = b.match(/^(#+)\s/);
      if (match) {
        const level = match[1].length;

        const newline = b.indexOf("\n");
        if (newline !== -1) {
          // Heading and paragraph were not separated by a blank line — split them
          const headingText = b.slice(level + 1, newline).trim();
          const paraText = b.slice(newline + 1).trim();
          if (paraText) {
            return [
              {
                type: "heading",
                attrs: { level },
                content: [{ type: "text", text: headingText }],
              },
              {
                type: "paragraph",
                content: [{ type: "text", text: paraText }],
              },
            ];
          }
          return [
            {
              type: "heading",
              attrs: { level },
              content: [{ type: "text", text: headingText }],
            },
          ];
        }
        return [
          {
            type: "heading",
            attrs: { level },
            content: [{ type: "text", text: b.slice(level + 1).trim() }],
          },
        ];
      }
      return [{ type: "paragraph", content: [{ type: "text", text: b }] }];
    });
  return JSON.stringify({
    type: "doc",
    content: blocks.length ? blocks : [{ type: "paragraph" }],
  });
}

// A pipe table: a row of cells followed by its |---| separator row.
const MARKDOWN_TABLE = /^\|.+\|[ \t]*\n\|[-:| \t]+\|[ \t]*$/m;

/**
 * Stored rich text that is not Tiptap JSON, as a document the read-only viewer
 * can render. Library content imported from Open5e (spell and item
 * descriptions) is plain text with markdown in it; the old editor-based viewer
 * parsed such a string as HTML, which collapsed its paragraphs and showed the
 * `**bold**` markers raw (#999).
 *
 * Block markdown (headings, quotes, two or more list items, a pipe table) goes
 * through `parseMarkdown`. Anything else is prose: blank lines separate
 * paragraphs, single newlines are soft wraps, and only inline emphasis is
 * converted. Prose is not handed to `parseMarkdown` because a PDF line break
 * before "15. On a success" would turn into a numbered list. Text stays text:
 * nothing here ever becomes markup.
 */
export function storedTextToDoc(text: string): { type: "doc"; content: TiptapNode[] } {
  if (looksLikeMarkdown(text) || MARKDOWN_TABLE.test(text)) {
    return { type: "doc", content: parseMarkdown(text) };
  }
  const content = text
    .split(/\n[ \t]*\n+/)
    .map((block) => block.replace(/[ \t]*\n[ \t]*/g, " ").trim())
    .filter((block) => block !== "")
    .map((block) => ({ type: "paragraph", content: markdownToInlineNodes(block) }));
  return { type: "doc", content };
}
