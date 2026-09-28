/**
 * Tiptap JSON → markdown, the inverse of `markdownToTiptap.ts`'s
 * `markdownToTiptapJson` (#829).
 *
 * The document importer's "paste text" source lets a DM paste HTML, which
 * `sourceHtml.ts` turns into real Tiptap structure so it can be reviewed and
 * trimmed in a `RichTextEditor`. Before that edited document is sent to the
 * extraction model as `document_imports.source_text`, it has to come back
 * out as plain text — and markdown is the plain-text encoding that keeps the
 * structure (heading depth, boxed text, tables) the extraction prompt reads
 * meaning from (see `supabase/functions/import-extract/index.ts`).
 *
 * Mirrors the node shapes `markdownToTiptap.ts` produces (paragraph, heading,
 * blockquote, bulletList/orderedList/listItem, table/tableRow/tableCell/
 * tableHeader, text with bold/italic marks, hardBreak) plus a handful of
 * shapes the *editor* (`RichTextEditor.vue`) actually produces that the
 * importer's own markdown source never does — `entityMention`, `image`, and
 * the `link`/`strike`/`code` marks (#932, Obsidian vault export, which reads
 * real edited documents rather than freshly-pasted ones). Everything else
 * (calendar refs, task lists, columns…) is still silently skipped, per the
 * "must not throw" contract below; it has nothing meaningful to say as
 * markdown anyway.
 *
 * Every conversion function here returns `null`/skips on a node it doesn't
 * recognize rather than throwing, and the outermost `tiptapToMarkdown` wraps
 * the whole per-node conversion in a try/catch besides — a malformed or
 * unexpected shape must degrade to "less markdown", never to a thrown error
 * that blocks the DM from submitting their edited paste.
 */

type JsonRecord = Record<string, unknown>;

/**
 * How to render an `entityMention` node. Defaults to the mention's plain
 * `label` (the importer's existing behaviour — a mention carries no meaning
 * outside the app it was written in). The Obsidian export passes a resolver
 * that turns it into a `[[wikilink]]` against its own exported file names.
 *
 * Called inside a try/catch — a throwing resolver degrades to the plain
 * label rather than aborting the whole conversion, matching the "must not
 * throw" contract of everything else in this module.
 */
export interface TiptapToMarkdownOptions {
  mention?: (attrs: { id: string; entityType: string; label: string }) => string;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function asNodeArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

// ── Inline content ───────────────────────────────────────────────────────

/** `code` and `strike` wrap innermost (their syntax reads worst nested inside
 *  emphasis), `link` wraps outermost — `[**bold link**](href)` matches how a
 *  DM would actually type it, and there is at most one `link` mark per run. */
function applyMarks(text: string, marks: unknown): string {
  const markList = asNodeArray(marks);
  const types = markList.map((m) => m.type);
  let out = text;
  if (types.includes("code")) out = `\`${out}\``;
  if (types.includes("strike")) out = `~~${out}~~`;
  if (types.includes("italic")) out = `_${out}_`;
  if (types.includes("bold")) out = `**${out}**`;
  const link = markList.find((m) => m.type === "link");
  const href = link && isRecord(link.attrs) ? link.attrs.href : undefined;
  if (typeof href === "string" && href) out = `[${out}](${href})`;
  return out;
}

/**
 * `entityMention` attrs are `{ id, entityType, label }` (`EntityMention.ts`).
 * Renders via `options.mention` when given, else the plain label — the
 * mention has nothing else to say as markdown, and this is the one node this
 * module renders instead of skipping (`atom: true`, so it never nests text
 * of its own for the default path to fall back to).
 */
function mentionToMarkdown(node: JsonRecord, options: TiptapToMarkdownOptions | undefined): string {
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const id = typeof attrs.id === "string" ? attrs.id : "";
  const entityType = typeof attrs.entityType === "string" ? attrs.entityType : "";
  const label = typeof attrs.label === "string" ? attrs.label : "";
  if (!options?.mention) return label;
  try {
    return options.mention({ id, entityType, label });
  } catch {
    return label;
  }
}

/** Renders the inline children of a paragraph/heading/cell — text nodes (with marks), hard breaks, and entity mentions. Unknown inline node types are skipped. */
function inlineToMarkdown(nodes: unknown, options?: TiptapToMarkdownOptions): string {
  return asNodeArray(nodes)
    .map((node) => {
      if (node.type === "hardBreak") return "  \n";
      if (node.type === "text" && typeof node.text === "string") return applyMarks(node.text, node.marks);
      if (node.type === "entityMention") return mentionToMarkdown(node, options);
      return "";
    })
    .join("");
}

// ── Block content ────────────────────────────────────────────────────────

function headingLevel(node: JsonRecord): number {
  const level = isRecord(node.attrs) && typeof node.attrs.level === "number" ? node.attrs.level : 1;
  return Math.min(Math.max(Math.trunc(level), 1), 6);
}

function listItemToMarkdown(item: JsonRecord, options: TiptapToMarkdownOptions | undefined): string {
  return asNodeArray(item.content)
    .map((n) => blockToMarkdown(n, options))
    .filter((b): b is string => b !== null && b.length > 0)
    .join(" ");
}

function listToMarkdown(node: JsonRecord, ordered: boolean, options: TiptapToMarkdownOptions | undefined): string | null {
  const items = asNodeArray(node.content);
  if (!items.length) return null;
  return items
    .map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${listItemToMarkdown(item, options)}`.trimEnd())
    .join("\n");
}

function cellToMarkdown(cell: JsonRecord, options: TiptapToMarkdownOptions | undefined): string {
  return asNodeArray(cell.content)
    .map((n) => blockToMarkdown(n, options))
    .filter((b): b is string => b !== null && b.length > 0)
    .join(" ");
}

/** `ResizableImage`'s attrs are `src`/`alt`/`title`/`width` (`RichTextEditor.vue`); a bare `Image` node has the first three. No `src` means nothing to link to. */
function imageToMarkdown(node: JsonRecord): string | null {
  const attrs = isRecord(node.attrs) ? node.attrs : {};
  const src = typeof attrs.src === "string" ? attrs.src : "";
  if (!src) return null;
  const alt = typeof attrs.alt === "string" ? attrs.alt : "";
  return `![${alt}](${src})`;
}

/**
 * GitHub-flavoured markdown table. The first row is always rendered as the
 * header (with a `---` separator after it) even when its cells are plain
 * `tableCell`s rather than `tableHeader`s — GFM tables require a header row
 * to exist at all, and this is feeding a model reading for structure, not
 * re-rendering a pixel-perfect table back.
 */
function tableToMarkdown(node: JsonRecord, options: TiptapToMarkdownOptions | undefined): string | null {
  const rows = asNodeArray(node.content).map((row) => asNodeArray(row.content));
  if (!rows.length) return null;
  const colCount = Math.max(...rows.map((cells) => cells.length));
  if (!colCount) return null;

  const renderRow = (cells: JsonRecord[]): string => {
    const texts = cells.map((c) => cellToMarkdown(c, options));
    while (texts.length < colCount) texts.push("");
    return `| ${texts.join(" | ")} |`;
  };

  const [headerRow, ...bodyRows] = rows;
  const lines = [renderRow(headerRow), `| ${Array(colCount).fill("---").join(" | ")} |`];
  for (const row of bodyRows) lines.push(renderRow(row));
  return lines.join("\n");
}

/** Converts one block-level node. Returns `null` for an unrecognized or empty node — the caller filters those out rather than emitting a blank line for each. */
function blockToMarkdown(node: JsonRecord, options?: TiptapToMarkdownOptions): string | null {
  switch (node.type) {
    case "heading": {
      const text = inlineToMarkdown(node.content, options);
      return text ? `${"#".repeat(headingLevel(node))} ${text}` : null;
    }
    case "paragraph": {
      const text = inlineToMarkdown(node.content, options);
      return text || null;
    }
    case "blockquote": {
      const inner = asNodeArray(node.content)
        .map((n) => blockToMarkdown(n, options))
        .filter((b): b is string => b !== null);
      if (!inner.length) return null;
      return inner
        .map((block) => block.split("\n").map((line) => `> ${line}`).join("\n"))
        // `"\n>\n"`, not `">\n"`. Each block is already `> `-prefixed on every
        // line, so the separator only has to supply the blank quoted line
        // between them. Joining on `">\n"` welded a stray `>` onto the end of
        // the previous block's last line — `> First para>` — which renders as
        // a literal `>` inside the quote. Only bites a blockquote holding more
        // than one block, which is why it survived: the read-aloud boxes that
        // motivated this are usually a single paragraph.
        .join("\n>\n");
    }
    case "bulletList":
      return listToMarkdown(node, false, options);
    case "orderedList":
      return listToMarkdown(node, true, options);
    case "table":
      return tableToMarkdown(node, options);
    case "horizontalRule":
      return "---";
    case "image":
      return imageToMarkdown(node);
    default:
      // Unknown or unsupported node type (calendar ref, task list,
      // columns…) — skip rather than throw.
      return null;
  }
}

// ── Entry point ──────────────────────────────────────────────────────────

/**
 * Converts a Tiptap document — a JSON string, an already-parsed object, or
 * absent — into a markdown string. Accepts `string | object | null |
 * undefined` because callers read this straight off a `RichTextEditor`
 * v-model (a JSON string) or off already-parsed state; never throws, on any
 * input — malformed JSON, an unexpected shape, or an individual node this
 * module doesn't recognize all degrade to "less output" rather than an
 * exception reaching the caller.
 *
 * `options.mention` lets a caller (the Obsidian vault export) turn an
 * `entityMention` into a `[[wikilink]]` instead of the default plain label;
 * every existing caller omits it and sees no change in output.
 */
export function tiptapToMarkdown(json: string | object | null | undefined, options?: TiptapToMarkdownOptions): string {
  if (!json) return "";

  let doc: unknown;
  if (typeof json === "string") {
    try {
      doc = JSON.parse(json);
    } catch {
      return "";
    }
  } else {
    doc = json;
  }
  if (!isRecord(doc)) return "";

  const blocks = asNodeArray(doc.content)
    .map((node) => {
      try {
        return blockToMarkdown(node, options);
      } catch {
        return null;
      }
    })
    .filter((b): b is string => b !== null && b.length > 0);

  return blocks.join("\n\n").trim();
}
