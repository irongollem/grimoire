/**
 * A deliberately small YAML-frontmatter reader (no YAML dependency).
 *
 * Reads what Obsidian vaults and our own export actually contain: scalar
 * `key: value` (bare, "double" or 'single' quoted), block lists
 * (`key:` + `  - item`), inline lists (`key: [a, b]`), numbers, booleans and
 * null. Nested maps, anchors and block scalars are skipped, not guessed at:
 * a frontmatter key we cannot read is simply absent, never wrong.
 */
import type { FrontmatterValue } from "./types";

export interface SplitFrontmatter {
  data: Record<string, FrontmatterValue>;
  /** The Markdown after the closing fence (the whole text when there is no frontmatter). */
  body: string;
}

const FENCE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

function unquote(raw: string): string {
  const v = raw.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    return v
      .slice(1, -1)
      .replace(/\\(["\\nrt])/g, (_, c: string) => (c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? "\t" : c));
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

function scalar(raw: string): FrontmatterValue {
  const v = raw.trim();
  if (v.startsWith('"') || v.startsWith("'")) return unquote(v);
  if (v === "" || v === "~" || v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

/** Splits an inline list body on commas that are not inside quotes. */
function splitInlineList(inner: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ",") {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => unquote(p)).filter((p) => p !== "");
}

export function splitFrontmatter(text: string): SplitFrontmatter {
  const source = text.replace(/^\uFEFF/, "");
  const match = FENCE.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, FrontmatterValue> = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_][\w .-]*?):(?:[ \t]+(.*))?$/.exec(lines[i]);
    if (!m) continue; // indented continuation, comment, or syntax we do not read
    const key = m[1].trim();
    const rest = (m[2] ?? "").trim();
    if (rest === "") {
      // Either a block list, a nested map (skipped), or an empty value.
      const items: string[] = [];
      let j = i + 1;
      while (j < lines.length && /^[ \t]*-[ \t]+/.test(lines[j])) {
        items.push(unquote(lines[j].replace(/^[ \t]*-[ \t]+/, "")));
        j++;
      }
      if (items.length) {
        data[key] = items;
        i = j - 1;
      } else if (j < lines.length && /^[ \t]+\S/.test(lines[j])) {
        while (j < lines.length && /^[ \t]+\S/.test(lines[j])) j++;
        i = j - 1; // nested map: not read
      } else data[key] = null;
    } else if (rest.startsWith("[") && rest.endsWith("]")) {
      data[key] = splitInlineList(rest.slice(1, -1));
    } else if (rest === "|" || rest === ">" || rest === "|-" || rest === ">-") {
      let j = i + 1;
      while (j < lines.length && /^[ \t]+/.test(lines[j])) j++;
      i = j - 1; // block scalar: not read
    } else {
      data[key] = scalar(rest);
    }
  }
  return { data, body: source.slice(match[0].length) };
}

/** A frontmatter value as one string, when it is a scalar or the first of a list. */
export function frontmatterString(value: FrontmatterValue | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/** A frontmatter value as a list of strings (a bare comma string counts as a list, as Obsidian reads `tags`). */
export function frontmatterList(value: FrontmatterValue | undefined): string[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.map((v) => v.trim()).filter(Boolean);
  return String(value)
    .split(/[,\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
}
