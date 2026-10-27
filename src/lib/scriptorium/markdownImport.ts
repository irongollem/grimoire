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
 *    A directive may carry arguments after its name (`::: lens light`).
 *
 *    ::: lens [light] [wide]   a lens pair (#1115). Paragraphs that open with a
 *                              bold run-in label (`**Bright.**`, `**Deep:**`,
 *                              `**Bright lens:**`) start that half; text before
 *                              any label is Bright. `light` sets the light
 *                              variant, `wide` wraps the pair in a wide block.
 *    ::: wide                  wraps its blocks in a wide block.
 *    ::: art                   `key: value` lines (slug, size, lane, existing,
 *                              alt, caption, brief): the image when the caller's
 *                              `resolveArt` finds one, else an "Art to come" note.
 *    ::: statblock / ::: embed `key: value` lines (name, and type for embed): a
 *                              live entity embed when `resolveEmbed` finds the
 *                              entity, else a placeholder note.
 *
 *    The resolvers are optional callbacks, so this module stays pure: the caller
 *    looks the art and the entities up and hands the answers in.
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
  args: string[];
  source: string;
}

const DIRECTIVE_OPEN = /^:::\s*([A-Za-z][\w-]*)((?:\s+\S+)*)\s*$/;
const DIRECTIVE_CLOSE = /^:::\s*$/;

/** Split raw markdown into plain segments and `::: name … :::` segments. */
function splitDirectiveSegments(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let directive: string | null = null;
  let args: string[] = [];
  let lines: string[] = [];

  const flush = (next: string | null, nextArgs: string[] = []) => {
    if (lines.length) segments.push({ directive, args, source: lines.join("\n") });
    directive = next;
    args = nextArgs;
    lines = [];
  };

  for (const line of markdown.split("\n")) {
    if (directive === null) {
      const open = DIRECTIVE_OPEN.exec(line);
      if (open) flush(open[1].toLowerCase(), open[2].toLowerCase().split(/\s+/).filter(Boolean));
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

// ── Lens pair ───────────────────────────────────────────────────────────────

/** The bold run-in label that opens a lens half: "Bright.", "Deep:", "Bright lens:". */
const LENS_LABEL = /^(bright|deep)(?:\s+lens)?\s*[.:]$/i;

type LensSide = "bright" | "deep";

/** Which half a paragraph opens, and the paragraph with that label removed. */
function splitLensLabel(block: JSONContent): { side: LensSide; rest: JSONContent | null } | null {
  if (block.type !== "paragraph") return null;
  const [first, ...others] = block.content ?? [];
  if (first?.type !== "text" || !first.text || !first.marks?.some((m) => m.type === "bold")) return null;
  const match = LENS_LABEL.exec(first.text.trim());
  if (!match) return null;
  const content = [...others];
  const next = content[0];
  if (next?.type === "text" && next.text) content[0] = { ...next, text: next.text.replace(/^\s+/, "") };
  const kept = content.filter((n) => n.type !== "text" || n.text);
  return { side: match[1].toLowerCase() === "deep" ? "deep" : "bright", rest: kept.length ? { ...block, content: kept } : null };
}

function lensPairNode(blocks: JSONContent[], args: string[]): JSONContent[] {
  const halves: Record<LensSide, JSONContent[]> = { bright: [], deep: [] };
  let side: LensSide = "bright";
  for (const block of blocks) {
    const label = splitLensLabel(block);
    if (label) {
      side = label.side;
      if (label.rest) halves[side].push(label.rest);
    } else {
      halves[side].push(block);
    }
  }
  const half = (type: string, content: JSONContent[]): JSONContent => ({
    type,
    content: content.length ? content : [{ type: "paragraph" }],
  });
  const pair: JSONContent = {
    type: "lensPair",
    attrs: { variant: args.includes("light") ? "light" : "boxed" },
    content: [half("lensBright", halves.bright), half("lensDeep", halves.deep)],
  };
  return [args.includes("wide") ? { type: "wideBlock", content: [pair] } : pair];
}

// ── Art, stat block and embed directives (`key: value` bodies) ──────────────

export type ArtSize = "full" | "half" | "column" | "wide" | "opener";

/** One piece of art a chapter asks for, as the `::: art` directive describes it. */
export interface ArtSlot {
  /** The slot's stable name, when the directive gives one. */
  slug?: string;
  size: ArtSize;
  lane?: string;
  /** A file the author says already exists. */
  existing?: string;
  alt?: string;
  caption?: string;
  brief?: string;
}

export interface MarkdownImportOptions {
  /** The image for a slot, or null when there is none yet. */
  resolveArt?: (slot: ArtSlot) => { src: string } | null;
  /** The campaign entity a `statblock` / `embed` names, or null when it is not there. */
  resolveEmbed?: (ref: { type: string; name: string }) => { id: string } | null;
}

const ART_SIZES: readonly ArtSize[] = ["full", "half", "column", "wide", "opener"];
const EMBED_TYPES = ["npc", "monster", "spell", "item", "location", "quest"] as const;
const EMBED_LABELS: Record<(typeof EMBED_TYPES)[number], string> = {
  npc: "NPC",
  monster: "Monster",
  spell: "Spell",
  item: "Item",
  location: "Location",
  quest: "Quest",
};

/** `key: value` lines; a line with no key continues the previous value. */
function keyValueLines(source: string): Map<string, string> {
  const out = new Map<string, string>();
  let last: string | null = null;
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const match = /^([A-Za-z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (match) {
      last = match[1].toLowerCase();
      out.set(last, match[2].trim());
    } else if (last) {
      out.set(last, `${out.get(last)} ${line}`.trim());
    }
  }
  return out;
}

/** The value for `key` when it holds anything. */
function field(fields: Map<string, string>, key: string): string | undefined {
  const value = fields.get(key);
  return value ? value : undefined;
}

function noteWithLines(lines: string[]): JSONContent {
  const content: JSONContent[] = lines.flatMap((text, i) => [
    ...(i > 0 ? [{ type: "hardBreak" }] : []),
    { type: "text", text },
  ]);
  return { type: "noteBlock", content: [{ type: "paragraph", content }] };
}

function artSlot(fields: Map<string, string>): ArtSlot {
  const size = field(fields, "size")?.toLowerCase();
  return {
    slug: field(fields, "slug"),
    size: ART_SIZES.find((s) => s === size) ?? "column",
    lane: field(fields, "lane"),
    existing: field(fields, "existing"),
    alt: field(fields, "alt"),
    caption: field(fields, "caption"),
    brief: field(fields, "brief"),
  };
}

function artNodes(source: string, options: MarkdownImportOptions): JSONContent[] {
  const slot = artSlot(keyValueLines(source));
  const found = options.resolveArt?.(slot) ?? null;
  if (!found) {
    // A slot that names nothing still says so, rather than printing a bare label.
    const lines = [`Art to come: ${slot.caption ?? slot.alt ?? slot.slug ?? "an unnamed slot"}`];
    if (slot.brief) lines.push(`Brief: ${slot.brief}`);
    else if (slot.existing) lines.push(`Source: ${slot.existing}`);
    return [noteWithLines(lines)];
  }
  // The image's width is a percentage string: renderHTML writes it as the
  // `width` attribute (valid HTML) and the theme caps images at the column.
  const wide = slot.size === "wide" || slot.size === "opener";
  const image: JSONContent = {
    type: "image",
    attrs: {
      src: found.src,
      alt: slot.alt ?? null,
      width: slot.size === "half" ? "50%" : "100%",
      dataAlign: "center",
    },
  };
  const caption: JSONContent[] = slot.caption
    ? [{ type: "paragraph", content: [{ type: "text", text: slot.caption, marks: [{ type: "italic" }] }] }]
    : [];
  return wide ? [{ type: "wideBlock", content: [image, ...caption] }] : [image, ...caption];
}

function embedNodes(directive: "statblock" | "embed", source: string, options: MarkdownImportOptions): JSONContent[] {
  const fields = keyValueLines(source);
  const name = field(fields, "name");
  if (!name) return [];
  const declared = field(fields, "type")?.toLowerCase();
  const type = directive === "statblock" ? "monster" : EMBED_TYPES.find((t) => t === declared);
  const label = directive === "statblock" ? "Stat block" : type ? EMBED_LABELS[type] : "Embed";
  const found = type ? (options.resolveEmbed?.({ type, name }) ?? null) : null;
  // An embed placed from a document's running text flows with it. The node's own
  // default (a fresh page) suits a single-entity handout, and in a bestiary it
  // left most of every stat block's page blank (#1115).
  if (type && found) return [{ type: "entityEmbed", attrs: { entityType: type, entityId: found.id, startsPage: false } }];
  return [noteWithLines([`${label}: ${name} (not yet in the campaign)`])];
}

function wrapDirective(name: string, args: string[], blocks: JSONContent[]): JSONContent[] {
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
    case "wide":
      return [{ type: "wideBlock", content: blocks }];
    case "lens":
      return lensPairNode(blocks, args);
    default:
      // Unknown directive: pass the content through so nothing is lost.
      return blocks;
  }
}

function directiveNodes(segment: Segment & { directive: string }, options: MarkdownImportOptions): JSONContent[] {
  switch (segment.directive) {
    case "art":
      return artNodes(segment.source, options);
    case "statblock":
    case "embed":
      return embedNodes(segment.directive, segment.source, options);
    default:
      return wrapDirective(segment.directive, segment.args, tokensToNodes(lexer(segment.source)));
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Convert a markdown document into a Tiptap `doc` node for the editor. */
export function markdownToScriptoriumContent(
  markdown: string,
  options: MarkdownImportOptions = {},
): JSONContent {
  const content = splitDirectiveSegments(markdown).flatMap((segment) =>
    segment.directive === null
      ? tokensToNodes(lexer(segment.source))
      : directiveNodes({ ...segment, directive: segment.directive }, options),
  );
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
