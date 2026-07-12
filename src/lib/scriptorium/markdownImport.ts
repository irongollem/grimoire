/*
 * Scriptorium Markdown Import
 *
 * Converts a markdown document (a campaign chapter, a homebrew supplement, a
 * Homebrewery brew) into Tiptap JSONContent for the Scriptorium editor — the
 * same shape the template gallery seeds new documents with.
 *
 * Standard markdown maps to the StarterKit vocabulary (headings, paragraphs,
 * emphasis, lists, tables, blockquotes, code, rules). On top of that, two
 * import-specific conventions map into Scriptorium's own nodes:
 *
 * 1. Homebrewery-style page directives — a paragraph containing only `\page`
 *    becomes a pageBreak node, `\column` a columnBreak. Brews written for the
 *    incumbent tools import with their pagination intent intact.
 *
 * 2. Fenced containers — Pandoc/remark-directive style `:::` blocks wrap
 *    their content in a Scriptorium callout:
 *
 *      ::: read-aloud            ::: note              ::: quote
 *      _Boxed read-aloud…_       DM-facing aside.      A pulled quote.
 *      :::                       :::                   — Attribution line
 *                                                      :::
 *
 *    `read-aloud` (alias `descriptive`) → descriptiveBlock, `note` (aliases
 *    `dm`, `dm-note`) → noteBlock, `quote` → quoteBlock; inside a quote, a
 *    final paragraph starting with an em-dash (`—` or `--`) becomes its
 *    attribution node. Unknown directive names pass their content through
 *    unwrapped, so partially-converted documents degrade gracefully.
 *
 * The converter is pure and returns fresh objects on every call (the template
 * gallery contract — Tiptap mutates node objects during configuration).
 */

import { lexer } from "marked";
import type { Token, Tokens } from "marked";
import type { JSONContent } from "@tiptap/core";

// ── Inline tokens → text/hardBreak nodes ────────────────────────────────────

interface InlineMark {
  type: string;
  attrs?: Record<string, unknown>;
}

/** Marks are copied per text node — Tiptap mutates nodes during load. */
function textNode(text: string, marks: InlineMark[]): JSONContent {
  return marks.length
    ? { type: "text", text, marks: marks.map((m) => ({ ...m })) }
    : { type: "text", text };
}

/**
 * Walk marked's inline tokens, accumulating text nodes with the active mark
 * stack. Images are block-level in the Scriptorium schema, so any image token
 * is collected into `images` and emitted after the enclosing paragraph.
 */
function inlineToNodes(
  tokens: Token[],
  marks: InlineMark[],
  images: JSONContent[],
): JSONContent[] {
  const out: JSONContent[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "strong":
        out.push(...inlineToNodes(t.tokens ?? [], [...marks, { type: "bold" }], images));
        break;
      case "em":
        out.push(...inlineToNodes(t.tokens ?? [], [...marks, { type: "italic" }], images));
        break;
      case "del":
        out.push(...inlineToNodes(t.tokens ?? [], [...marks, { type: "strike" }], images));
        break;
      case "link": {
        const link: InlineMark = { type: "link", attrs: { href: (t as Tokens.Link).href } };
        out.push(...inlineToNodes(t.tokens ?? [], [...marks, link], images));
        break;
      }
      case "codespan":
        if (t.text) out.push(textNode(t.text, [...marks, { type: "code" }]));
        break;
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "image": {
        const img = t as Tokens.Image;
        images.push({
          type: "image",
          attrs: { src: img.href, alt: img.text || null, dataAlign: "center" },
        });
        break;
      }
      case "escape":
        if (t.text) out.push(textNode(t.text, marks));
        break;
      case "text": {
        const nested = (t as Tokens.Text).tokens;
        if (nested?.length) out.push(...inlineToNodes(nested, marks, images));
        // marked leaves soft line-breaks inside text tokens; a paragraph is
        // one flowing unit in the book, so they become spaces.
        else if (t.text) out.push(textNode(t.text.replace(/\n/g, " "), marks));
        break;
      }
      default:
        // Raw inline HTML and anything else marked emits that has no
        // Scriptorium equivalent: keep the visible text, drop the markup.
        if ("text" in t && typeof t.text === "string" && t.text) {
          out.push(textNode(t.text, marks));
        }
    }
  }
  return out;
}

// ── Block tokens → Scriptorium block nodes ──────────────────────────────────

const PAGE_DIRECTIVE = /^\\?\\page$/;
const COLUMN_DIRECTIVE = /^\\?\\column$/;

function paragraphNodes(tokens: Token[]): JSONContent[] {
  const images: JSONContent[] = [];
  const inline = inlineToNodes(tokens, [], images);
  const nodes: JSONContent[] = [];
  if (inline.length) nodes.push({ type: "paragraph", content: inline });
  nodes.push(...images);
  return nodes;
}

function listItemContent(tokens: Token[]): JSONContent[] {
  const blocks: JSONContent[] = [];
  for (const t of tokens) {
    // Tight list items carry a block-level "text" token instead of a paragraph.
    if (t.type === "text") blocks.push(...paragraphNodes((t as Tokens.Text).tokens ?? []));
    else blocks.push(...blockToNodes(t));
  }
  return blocks.length ? blocks : [{ type: "paragraph" }];
}

function tableCell(cell: Tokens.TableCell, header: boolean): JSONContent {
  const images: JSONContent[] = [];
  const inline = inlineToNodes(cell.tokens ?? [], [], images);
  return {
    type: header ? "tableHeader" : "tableCell",
    content: [inline.length ? { type: "paragraph", content: inline } : { type: "paragraph" }],
  };
}

function blockToNodes(token: Token): JSONContent[] {
  switch (token.type) {
    case "heading": {
      const t = token as Tokens.Heading;
      const images: JSONContent[] = [];
      const inline = inlineToNodes(t.tokens ?? [], [], images);
      const nodes: JSONContent[] = [];
      if (inline.length) {
        nodes.push({
          type: "heading",
          attrs: { level: Math.min(t.depth, 6) },
          content: inline,
        });
      }
      nodes.push(...images);
      return nodes;
    }

    case "paragraph": {
      const t = token as Tokens.Paragraph;
      const trimmed = t.text.trim();
      if (PAGE_DIRECTIVE.test(trimmed)) return [{ type: "pageBreak" }];
      if (COLUMN_DIRECTIVE.test(trimmed)) return [{ type: "columnBreak" }];
      return paragraphNodes(t.tokens ?? []);
    }

    case "list": {
      const t = token as Tokens.List;
      const items = t.items.map((item) => ({
        type: "listItem",
        content: listItemContent(item.tokens ?? []),
      }));
      if (!items.length) return [];
      return t.ordered
        ? [
            {
              type: "orderedList",
              attrs: { start: typeof t.start === "number" ? t.start : 1 },
              content: items,
            },
          ]
        : [{ type: "bulletList", content: items }];
    }

    case "table": {
      const t = token as Tokens.Table;
      const rows: JSONContent[] = [
        { type: "tableRow", content: t.header.map((c) => tableCell(c, true)) },
        ...t.rows.map((row) => ({
          type: "tableRow",
          content: row.map((c) => tableCell(c, false)),
        })),
      ];
      return [{ type: "table", content: rows }];
    }

    case "blockquote": {
      const t = token as Tokens.Blockquote;
      const content = tokensToNodes(t.tokens ?? []);
      return content.length ? [{ type: "blockquote", content }] : [];
    }

    case "code": {
      const t = token as Tokens.Code;
      return [
        {
          type: "codeBlock",
          attrs: { language: t.lang || null },
          ...(t.text ? { content: [{ type: "text", text: t.text }] } : {}),
        },
      ];
    }

    case "hr":
      return [{ type: "horizontalRule" }];

    // Layout whitespace, link definitions, raw block HTML: nothing to place
    // on a page.
    case "space":
    case "def":
    case "html":
      return [];

    default:
      if ("tokens" in token && Array.isArray(token.tokens)) {
        return paragraphNodes(token.tokens as Token[]);
      }
      return [];
  }
}

function tokensToNodes(tokens: Token[]): JSONContent[] {
  return tokens.flatMap((t) => blockToNodes(t));
}

// ── ::: directive containers ────────────────────────────────────────────────

interface Segment {
  directive: string | null;
  source: string;
}

const DIRECTIVE_OPEN = /^:::\s*([A-Za-z][\w-]*)\s*$/;
const DIRECTIVE_CLOSE = /^:::\s*$/;

/** Split raw markdown into plain segments and `::: name … :::` segments. */
function splitDirectiveSegments(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let directive: string | null = null;
  let lines: string[] = [];

  const flush = (next: string | null) => {
    if (lines.length) segments.push({ directive, source: lines.join("\n") });
    directive = next;
    lines = [];
  };

  for (const line of markdown.split("\n")) {
    if (directive === null) {
      const open = DIRECTIVE_OPEN.exec(line);
      if (open) flush(open[1].toLowerCase());
      else lines.push(line);
    } else if (DIRECTIVE_CLOSE.test(line)) {
      flush(null);
    } else {
      lines.push(line);
    }
  }
  flush(null); // an unclosed directive closes at end of input
  return segments;
}

const ATTRIBUTION_PREFIX = /^(?:—|--)\s*/;

/** quoteBlock accepts only paragraph|attribution children. */
function quoteBlockContent(blocks: JSONContent[]): JSONContent[] {
  const paragraphs = blocks.filter((b) => b.type === "paragraph");
  if (!paragraphs.length) return [];
  const last = paragraphs[paragraphs.length - 1];
  const first = last.content?.[0];
  if (first?.type === "text" && first.text && ATTRIBUTION_PREFIX.test(first.text)) {
    const rest = first.text.replace(ATTRIBUTION_PREFIX, "");
    const content = [
      ...(rest ? [{ ...first, text: rest }] : []),
      ...(last.content?.slice(1) ?? []),
    ];
    paragraphs[paragraphs.length - 1] = { type: "attribution", content };
  }
  return paragraphs;
}

function wrapDirective(name: string, blocks: JSONContent[]): JSONContent[] {
  if (!blocks.length) return [];
  switch (name) {
    case "read-aloud":
    case "descriptive":
      return [{ type: "descriptiveBlock", content: blocks }];
    case "note":
    case "dm":
    case "dm-note":
      return [{ type: "noteBlock", content: blocks }];
    case "quote": {
      const content = quoteBlockContent(blocks);
      return content.length ? [{ type: "quoteBlock", content }] : [];
    }
    default:
      // Unknown directive: pass the content through so nothing is lost.
      return blocks;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Convert a markdown document into a Tiptap `doc` node for the editor. */
export function markdownToScriptoriumContent(markdown: string): JSONContent {
  const content = splitDirectiveSegments(markdown).flatMap((segment) => {
    const blocks = tokensToNodes(lexer(segment.source));
    return segment.directive ? wrapDirective(segment.directive, blocks) : blocks;
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** Plain text of the document's first `#` heading, or the fallback. */
export function markdownTitle(markdown: string, fallback: string): string {
  for (const segment of splitDirectiveSegments(markdown)) {
    for (const token of lexer(segment.source)) {
      if (token.type === "heading" && (token as Tokens.Heading).depth === 1) {
        const images: JSONContent[] = [];
        const text = inlineToNodes((token as Tokens.Heading).tokens ?? [], [], images)
          .map((n) => n.text ?? "")
          .join("")
          .trim();
        if (text) return text;
      }
    }
  }
  return fallback;
}
