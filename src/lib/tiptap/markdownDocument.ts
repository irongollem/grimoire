/**
 * The one Markdown → Tiptap converter (RichTextEditor schema).
 *
 * Built on `marked`'s lexer rather than hand-rolled line matching, because
 * two very different callers need the same answer: a pasted AI output or
 * Open5e description (`markdownToTiptap.ts`, which now delegates here) and a
 * whole Obsidian vault read from a zip (`lib/archiveImport`). A second
 * Markdown reader would drift from the first on exactly the cases a vault
 * exercises and a paste never does: nested lists, task lists, tables with
 * inline marks, callouts, fenced code.
 *
 * Output uses only nodes and marks the editor schema owns: paragraph,
 * heading, bulletList / orderedList / listItem, taskList / taskItem,
 * blockquote, codeBlock, horizontalRule, hardBreak, table / tableRow /
 * tableHeader / tableCell, and the bold / italic / strike / code / link marks.
 * Anything the schema cannot hold (images, raw HTML blocks) degrades to its
 * text or disappears; nothing here ever emits markup, because the text is
 * stored and rendered as text.
 *
 * Two hooks let a caller own the parts Markdown has no standard answer for:
 * `wikilink` (Obsidian `[[Target|Alias]]` and `![[Embed]]`) and `link` (an
 * ordinary `[label](href)`, for a caller that wants to claim relative links
 * between pages). Without them wikilinks stay literal text and links become
 * link marks.
 */
import { Lexer, Marked } from "marked";
import type { Token, Tokens } from "marked";

export type TiptapNode = Record<string, unknown>;
interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface WikilinkInfo {
  /** Everything before `|`, with the `#heading` / `#^block` anchor removed. May be empty for a same-page `[[#Heading]]`. */
  target: string;
  /** The alias after `|`, or the last path segment of the target when there is none. */
  label: string;
  /** `![[…]]`: an embed (transclusion), not a link. */
  embed: boolean;
}

export interface MarkdownDocumentOptions {
  /**
   * Called for each `[[…]]` / `![[…]]`. Return a node (spliced inline, keeping
   * the surrounding marks), an array of nodes, or `[]` to drop it. Absent: the
   * wikilink syntax is not recognised and survives as literal text.
   */
  wikilink?: (link: WikilinkInfo) => TiptapNode | TiptapNode[];
  /**
   * What to do with raw HTML written inside the Markdown. `"text"` (default)
   * keeps it as literal text, which is what stored and pasted text needs: a
   * `<p>` typed into a description stays visible rather than vanishing.
   * `"strip"` is for a document read from a vault, where inline tags are
   * markup noise (`<br>` becomes a line break, other tags are dropped).
   */
  html?: "text" | "strip";
  /** Called for each ordinary `[label](href)`. Return a node to replace it, or `null` for the default link mark. */
  link?: (link: { href: string; label: string }) => TiptapNode | null;
}

// ── marked instances ────────────────────────────────────────────────────

/** `[[target|alias]]` / `![[embed]]`. Anchored, no newline inside, so an unclosed `[[` stays text. */
const WIKILINK = /^(!?)\[\[([^\]\n]+?)\]\]/;

interface WikilinkToken extends Tokens.Generic {
  type: "wikilink";
  embed: boolean;
  body: string;
}

const plainMarked = new Marked({ gfm: true });
const wikilinkMarked = new Marked({
  gfm: true,
  extensions: [
    {
      name: "wikilink",
      level: "inline",
      start(src: string) {
        const at = src.search(/!?\[\[/);
        return at < 0 ? undefined : at;
      },
      tokenizer(src: string): WikilinkToken | undefined {
        const m = WIKILINK.exec(src);
        if (!m) return undefined;
        return { type: "wikilink", raw: m[0], embed: m[1] === "!", body: m[2] };
      },
    },
  ],
});

function instanceFor(options: MarkdownDocumentOptions): Marked {
  return options.wikilink ? wikilinkMarked : plainMarked;
}

function parseWikilink(token: WikilinkToken): WikilinkInfo {
  const pipe = token.body.indexOf("|");
  const rawTarget = pipe < 0 ? token.body : token.body.slice(0, pipe);
  const alias = pipe < 0 ? "" : token.body.slice(pipe + 1).trim();
  const target = rawTarget.split("#")[0].trim();
  const fallbackLabel = target.split("/").pop()?.trim() ?? target;
  return { target, label: alias || fallbackLabel || rawTarget.trim(), embed: token.embed };
}

// ── inline ──────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

/** The lexer hands text through still entity-encoded; the document stores plain text. */
function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m);
}

function textNode(text: string, marks: TiptapMark[]): TiptapNode | null {
  if (!text) return null;
  return marks.length
    ? { type: "text", text, marks: marks.map((m) => ({ ...m })) }
    : { type: "text", text };
}

/** Plain text of inline tokens, for a link label or a callout title. */
function plainText(tokens: Token[] | undefined, fallback: string): string {
  if (!tokens) return decodeEntities(fallback);
  return tokens
    .map((t) => {
      if (t.type === "br") return " ";
      if ("tokens" in t && Array.isArray(t.tokens)) return plainText(t.tokens as Token[], t.raw);
      if (t.type === "wikilink") return parseWikilink(t as WikilinkToken).label;
      if (t.type === "html") return "";
      return decodeEntities("text" in t && typeof t.text === "string" ? t.text : t.raw);
    })
    .join("");
}

/** A soft wrap in the source is a space in the document (what the old converter did, and what Markdown means). */
function inlineToNodes(tokens: Token[], marks: TiptapMark[], options: MarkdownDocumentOptions): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "text":
      case "escape": {
        const t = token as Tokens.Text;
        if (t.tokens?.length) out.push(...inlineToNodes(t.tokens, marks, options));
        else {
          const node = textNode(decodeEntities(t.text).replace(/\s*\n\s*/g, " "), marks);
          if (node) out.push(node);
        }
        break;
      }
      case "strong":
        out.push(...inlineToNodes((token as Tokens.Strong).tokens, [...marks, { type: "bold" }], options));
        break;
      case "em":
        out.push(...inlineToNodes((token as Tokens.Em).tokens, [...marks, { type: "italic" }], options));
        break;
      case "del":
        out.push(...inlineToNodes((token as Tokens.Del).tokens, [...marks, { type: "strike" }], options));
        break;
      case "codespan": {
        // `code` excludes other marks in the editor schema, so it stands alone.
        const node = textNode(decodeEntities((token as Tokens.Codespan).text), [{ type: "code" }]);
        if (node) out.push(node);
        break;
      }
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "link": {
        const t = token as Tokens.Link;
        const label = plainText(t.tokens, t.text);
        const claimed = options.link?.({ href: t.href, label });
        if (claimed) {
          out.push(withMarks(claimed, marks));
          break;
        }
        out.push(...inlineToNodes(t.tokens, [...marks, { type: "link", attrs: { href: t.href } }], options));
        break;
      }
      case "image": {
        // The editor schema has no inline image; the alt text is what is left.
        const node = textNode(decodeEntities((token as Tokens.Image).text), marks);
        if (node) out.push(node);
        break;
      }
      case "html": {
        if (options.html !== "strip") {
          const node = textNode(token.raw, marks);
          if (node) out.push(node);
        } else if (/^<br\s*\/?>$/i.test(token.raw.trim())) out.push({ type: "hardBreak" });
        break;
      }
      case "wikilink": {
        const info = parseWikilink(token as WikilinkToken);
        const produced = options.wikilink?.(info);
        if (produced === undefined) {
          const node = textNode(token.raw, marks);
          if (node) out.push(node);
        } else {
          for (const node of Array.isArray(produced) ? produced : [produced]) out.push(withMarks(node, marks));
        }
        break;
      }
      default: {
        const node = textNode(decodeEntities(token.raw), marks);
        if (node) out.push(node);
      }
    }
  }
  return out;
}

/** A hook's node inherits the surrounding emphasis, unless it already carries marks of its own. */
function withMarks(node: TiptapNode, marks: TiptapMark[]): TiptapNode {
  if (!marks.length || node.marks) return node;
  return { ...node, marks: marks.map((m) => ({ ...m })) };
}

function paragraphOf(tokens: Token[] | undefined, raw: string, options: MarkdownDocumentOptions): TiptapNode {
  const content = inlineToNodes(tokens ?? [{ type: "text", raw, text: raw } as Tokens.Text], [], options);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

// ── blocks ──────────────────────────────────────────────────────────────

/** Obsidian callout: `> [!type] Title` as the first line of a quote. */
const CALLOUT = /^\[!([\w-]+)\][+-]?[ \t]*(.*)$/;

function calloutTitle(token: Tokens.Blockquote, options: MarkdownDocumentOptions): { type: string; title: string; rest: Token[] } | null {
  const first = token.tokens[0];
  if (!first || first.type !== "paragraph") return null;
  const para = first as Tokens.Paragraph;
  const firstLine = para.text.split("\n")[0];
  const m = CALLOUT.exec(firstLine);
  if (!m) return null;
  // Re-lex what follows the marker line (with the same instance, so wikilinks in it still tokenise).
  const newline = para.text.indexOf("\n");
  const remainder = newline < 0 ? "" : para.text.slice(newline + 1);
  const rest = remainder ? instanceFor(options).lexer(remainder) : [];
  return { type: m[1].toLowerCase(), title: m[2].trim() || capitalise(m[1]), rest: [...rest, ...token.tokens.slice(1)] };
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function blocksOf(tokens: Token[], options: MarkdownDocumentOptions): TiptapNode[] {
  const out: TiptapNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const t = token as Tokens.Heading;
        const content = inlineToNodes(t.tokens, [], options);
        out.push({
          type: "heading",
          attrs: { level: Math.min(6, Math.max(1, t.depth)) },
          ...(content.length ? { content } : {}),
        });
        break;
      }
      case "paragraph":
        out.push(paragraphOf((token as Tokens.Paragraph).tokens, token.raw, options));
        break;
      case "text":
        // A tight list item's text is a block-level `text` token.
        out.push(paragraphOf((token as Tokens.Text).tokens, token.raw, options));
        break;
      case "blockquote":
        out.push(blockquoteOf(token as Tokens.Blockquote, options));
        break;
      case "list":
        out.push(listOf(token as Tokens.List, options));
        break;
      case "code": {
        const t = token as Tokens.Code;
        out.push({
          type: "codeBlock",
          attrs: { language: t.lang?.trim() || null },
          ...(t.text ? { content: [{ type: "text", text: t.text }] } : {}),
        });
        break;
      }
      case "hr":
        out.push({ type: "horizontalRule" });
        break;
      case "table":
        out.push(tableOf(token as Tokens.Table, options));
        break;
      case "html": {
        // A raw HTML block is never kept as markup: literal text, or (strip) just the text it carries.
        const text = options.html === "strip"
          ? decodeEntities(token.raw.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim()
          : token.raw.replace(/\s*\n\s*/g, " ").trim();
        if (text) out.push({ type: "paragraph", content: [{ type: "text", text }] });
        break;
      }
      default:
        // `space` and anything unknown: no content.
        break;
    }
  }
  return out;
}

function blockquoteOf(token: Tokens.Blockquote, options: MarkdownDocumentOptions): TiptapNode {
  const callout = calloutTitle(token, options);
  if (callout) {
    // `> [!secret]` is what `tiptapToMarkdown` writes for a DM-only block, so
    // an exported vault reads back with its secrets still withheld. Reading
    // any other text as DM-only only ever hides it, never shows it.
    if (callout.type.toLowerCase() === "secret") {
      const content = blocksOf(callout.rest, options);
      return { type: "secretBlock", content: content.length ? content : [{ type: "paragraph" }] };
    }
    // The editor has no other callout node; the title survives as a bold first line.
    const title: TiptapNode = { type: "paragraph", content: [{ type: "text", text: callout.title, marks: [{ type: "bold" }] }] };
    return { type: "blockquote", content: [title, ...blocksOf(callout.rest, options)] };
  }
  const content = blocksOf(token.tokens, options);
  return { type: "blockquote", content: content.length ? content : [{ type: "paragraph" }] };
}

function listOf(token: Tokens.List, options: MarkdownDocumentOptions): TiptapNode {
  const isTask = token.items.some((item) => item.task);
  const items = token.items.map((item) => {
    // The checkbox is its own token ahead of the text; it is not content.
    const body = blocksOf(item.tokens.filter((t) => t.type !== "checkbox"), options);
    // A list item must open with a paragraph.
    const content = body.length && body[0].type !== "paragraph" && body[0].type !== "heading" ? [{ type: "paragraph" }, ...body] : body;
    const safe = content.length ? content : [{ type: "paragraph" }];
    return isTask
      ? { type: "taskItem", attrs: { checked: item.checked === true }, content: safe }
      : { type: "listItem", content: safe };
  });
  if (isTask) return { type: "taskList", content: items };
  if (token.ordered) {
    return { type: "orderedList", attrs: { start: typeof token.start === "number" ? token.start : 1 }, content: items };
  }
  return { type: "bulletList", content: items };
}

function tableOf(token: Tokens.Table, options: MarkdownDocumentOptions): TiptapNode {
  const cell = (c: Tokens.TableCell, header: boolean): TiptapNode => ({
    type: header ? "tableHeader" : "tableCell",
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [paragraphOf(c.tokens, c.text, options)],
  });
  return {
    type: "table",
    content: [
      { type: "tableRow", content: token.header.map((c) => cell(c, true)) },
      ...token.rows.map((row) => ({ type: "tableRow", content: row.map((c) => cell(c, false)) })),
    ],
  };
}

// ── entry points ────────────────────────────────────────────────────────

/** Markdown as the block nodes of a Tiptap document (the children of `doc`). Empty input gives an empty array. */
export function markdownToTiptapNodes(markdown: string, options: MarkdownDocumentOptions = {}): TiptapNode[] {
  return blocksOf(instanceFor(options).lexer(markdown), options);
}

/** Markdown as a full Tiptap document object. */
export function markdownToTiptapDoc(markdown: string, options: MarkdownDocumentOptions = {}): { type: "doc"; content: TiptapNode[] } {
  return { type: "doc", content: markdownToTiptapNodes(markdown, options) };
}

/**
 * Inline Markdown only (emphasis, code, links) as the inline nodes of one
 * paragraph. Never block-lexes, so a line that merely starts with "15." stays
 * prose, which is what a paragraph of PDF text needs.
 */
export function markdownToInlineNodes(text: string, options: MarkdownDocumentOptions = {}): TiptapNode[] {
  return inlineToNodes(Lexer.lexInline(text, { gfm: true }), [], options);
}
