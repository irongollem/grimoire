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
 * tableHeader, text with bold/italic marks, hardBreak) rather than the full
 * Tiptap/ProseMirror node set — anything else (images, calendar refs, entity
 * mentions, task lists…) is silently skipped, per the "must not throw"
 * contract below; it has nothing meaningful to say as markdown anyway.
 *
 * Every conversion function here returns `null`/skips on a node it doesn't
 * recognize rather than throwing, and the outermost `tiptapToMarkdown` wraps
 * the whole per-node conversion in a try/catch besides — a malformed or
 * unexpected shape must degrade to "less markdown", never to a thrown error
 * that blocks the DM from submitting their edited paste.
 */

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function asNodeArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

// ── Inline content ───────────────────────────────────────────────────────

function applyMarks(text: string, marks: unknown): string {
  const types = asNodeArray(marks).map((m) => m.type);
  let out = text;
  if (types.includes("italic")) out = `_${out}_`;
  if (types.includes("bold")) out = `**${out}**`;
  return out;
}

/** Renders the inline children of a paragraph/heading/cell — text nodes (with bold/italic marks) and hard breaks. Unknown inline node types are skipped. */
function inlineToMarkdown(nodes: unknown): string {
  return asNodeArray(nodes)
    .map((node) => {
      if (node.type === "hardBreak") return "  \n";
      if (node.type === "text" && typeof node.text === "string") return applyMarks(node.text, node.marks);
      return "";
    })
    .join("");
}

// ── Block content ────────────────────────────────────────────────────────

function headingLevel(node: JsonRecord): number {
  const level = isRecord(node.attrs) && typeof node.attrs.level === "number" ? node.attrs.level : 1;
  return Math.min(Math.max(Math.trunc(level), 1), 6);
}

function listItemToMarkdown(item: JsonRecord): string {
  return asNodeArray(item.content)
    .map(blockToMarkdown)
    .filter((b): b is string => b !== null && b.length > 0)
    .join(" ");
}

function listToMarkdown(node: JsonRecord, ordered: boolean): string | null {
  const items = asNodeArray(node.content);
  if (!items.length) return null;
  return items
    .map((item, index) => `${ordered ? `${index + 1}.` : "-"} ${listItemToMarkdown(item)}`.trimEnd())
    .join("\n");
}

function cellToMarkdown(cell: JsonRecord): string {
  return asNodeArray(cell.content)
    .map(blockToMarkdown)
    .filter((b): b is string => b !== null && b.length > 0)
    .join(" ");
}

/**
 * GitHub-flavoured markdown table. The first row is always rendered as the
 * header (with a `---` separator after it) even when its cells are plain
 * `tableCell`s rather than `tableHeader`s — GFM tables require a header row
 * to exist at all, and this is feeding a model reading for structure, not
 * re-rendering a pixel-perfect table back.
 */
function tableToMarkdown(node: JsonRecord): string | null {
  const rows = asNodeArray(node.content).map((row) => asNodeArray(row.content));
  if (!rows.length) return null;
  const colCount = Math.max(...rows.map((cells) => cells.length));
  if (!colCount) return null;

  const renderRow = (cells: JsonRecord[]): string => {
    const texts = cells.map(cellToMarkdown);
    while (texts.length < colCount) texts.push("");
    return `| ${texts.join(" | ")} |`;
  };

  const [headerRow, ...bodyRows] = rows;
  const lines = [renderRow(headerRow), `| ${Array(colCount).fill("---").join(" | ")} |`];
  for (const row of bodyRows) lines.push(renderRow(row));
  return lines.join("\n");
}

/** Converts one block-level node. Returns `null` for an unrecognized or empty node — the caller filters those out rather than emitting a blank line for each. */
function blockToMarkdown(node: JsonRecord): string | null {
  switch (node.type) {
    case "heading": {
      const text = inlineToMarkdown(node.content);
      return text ? `${"#".repeat(headingLevel(node))} ${text}` : null;
    }
    case "paragraph": {
      const text = inlineToMarkdown(node.content);
      return text || null;
    }
    case "blockquote": {
      const inner = asNodeArray(node.content)
        .map(blockToMarkdown)
        .filter((b): b is string => b !== null);
      if (!inner.length) return null;
      return inner
        .map((block) => block.split("\n").map((line) => `> ${line}`).join("\n"))
        .join(">\n");
    }
    case "bulletList":
      return listToMarkdown(node, false);
    case "orderedList":
      return listToMarkdown(node, true);
    case "table":
      return tableToMarkdown(node);
    case "horizontalRule":
      return "---";
    default:
      // Unknown or unsupported node type (image, calendar ref, entity
      // mention, task list, columns…) — skip rather than throw.
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
 */
export function tiptapToMarkdown(json: string | object | null | undefined): string {
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
        return blockToMarkdown(node);
      } catch {
        return null;
      }
    })
    .filter((b): b is string => b !== null && b.length > 0);

  return blocks.join("\n\n").trim();
}
