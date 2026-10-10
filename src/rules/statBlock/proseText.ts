/**
 * Plain text out of a stat-block entry description (#1017).
 *
 * A description is plain text, or a stored Tiptap JSON string (a doc node tree).
 * Imported by edge functions, so no DOM and no tiptap import: the JSON is walked
 * by hand. Relative `.ts` imports only.
 */

interface TiptapNode {
  type?: string;
  text?: string;
  content?: TiptapNode[];
}

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
]);

function isNode(value: unknown): value is TiptapNode {
  return typeof value === "object" && value !== null;
}

/** Append a node's text to `lines`, one line per block (paragraph, list item, ...). */
function walk(node: TiptapNode, lines: string[]): void {
  if (node.type === "hardBreak") {
    lines.push("");
    return;
  }
  if (typeof node.text === "string") {
    lines[lines.length - 1] += node.text;
    return;
  }
  const children = Array.isArray(node.content) ? node.content : [];
  const isBlock = node.type !== undefined && BLOCK_TYPES.has(node.type);
  if (isBlock && lines[lines.length - 1] !== "") lines.push("");
  for (const child of children) {
    if (isNode(child)) walk(child, lines);
  }
  if (isBlock && lines[lines.length - 1] !== "") lines.push("");
}

function tiptapToLines(raw: string): string[] | null {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isNode(parsed) || parsed.type !== "doc") return null;
  const lines = [""];
  walk(parsed, lines);
  return lines;
}

/**
 * The text of a description: paragraphs joined with "\n", whitespace runs within
 * a line collapsed, empty lines dropped.
 */
export function entryPlainText(description: string): string {
  const lines = tiptapToLines(description) ?? description.split(/\r?\n/);
  return lines
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

/**
 * Text normalised for matching: en/em dashes and the minus sign become "-" (so
 * "Recharge 5–6" and "–1 to hit" read like their ASCII forms), non-breaking
 * spaces become spaces, and typographic apostrophes become "'".
 */
export function normalizeForMatch(text: string): string {
  return text
    .replace(/[‐-―−]/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/[‘’]/g, "'");
}

/**
 * `entryPlainText` followed by `normalizeForMatch`, flattened to a single line and
 * with Markdown emphasis marks ("_Melee Weapon Attack:_", "**Breath.**") removed:
 * imported descriptions carry them, and they would split a cue from its colon.
 */
export function entryMatchText(description: string): string {
  return normalizeForMatch(entryPlainText(description))
    .replace(/[*_]+/g, "")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+/g, " ");
}
