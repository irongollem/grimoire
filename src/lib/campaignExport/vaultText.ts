/**
 * Pure text helpers for the Markdown/Obsidian vault export (#932) — file
 * naming and YAML frontmatter. Deliberately dependency-free (no YAML
 * library): frontmatter here is a handful of scalar/list fields per entity,
 * which a tiny always-quote encoder covers correctly without pulling in a
 * parser for the cases this export never produces (anchors, multi-line
 * block scalars, flow collections…).
 */

/** Characters Windows/macOS/Obsidian all forbid or treat specially in a file name. */
const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|]/g;

/**
 * `<sanitized name>.md` per the story spec: strip the unsafe characters,
 * collapse runs of whitespace (a stripped character often leaves a double
 * space behind), trim, and fall back to "Untitled" for a name that sanitizes
 * to nothing (blank, or entirely unsafe characters).
 */
export function sanitizeFileName(raw: string | null | undefined): string {
  const cleaned = (raw ?? "")
    .replace(UNSAFE_FILENAME_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Untitled";
}

/**
 * Dedupes a sanitized base name against the names already used *in the same
 * folder*, appending " (2)", " (3)", … on collision. Mutates `used` with
 * whichever name it returns, so a caller assigning file names for a whole
 * folder can fold over the same set.
 */
export function dedupeFileName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base} (${n})`)) n++;
  const deduped = `${base} (${n})`;
  used.add(deduped);
  return deduped;
}

/**
 * A YAML double-quoted scalar. Always quotes and escapes rather than trying
 * to detect when quoting is unnecessary — a name can legitimately contain a
 * colon, a leading `-`, a `#`, or start with something that looks like a
 * YAML bool/null ("No", "null the Wise") and a heuristic that misses one of
 * those silently corrupts the frontmatter block. Always-quote is always
 * correct instead.
 */
export function yamlString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
  return `"${escaped}"`;
}

export type VaultFrontmatterValue = string | number | string[] | null | undefined;

/**
 * Builds a `---`-fenced YAML frontmatter block from ordered `[key, value]`
 * pairs. A `null`/`undefined`/empty-string scalar is omitted entirely (an
 * absent field, not a written-out blank); an empty list still renders as
 * `key: []` so a reader can tell "no tags" from "tags never considered".
 * Numbers are written bare (YAML needs no quoting for those).
 */
export function buildFrontmatter(fields: Array<[string, VaultFrontmatterValue]>): string {
  const lines: string[] = [];
  for (const [key, value] of fields) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
        continue;
      }
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlString(item)}`);
      continue;
    }
    if (typeof value === "number") {
      lines.push(`${key}: ${value}`);
      continue;
    }
    if (value === "") continue;
    lines.push(`${key}: ${yamlString(value)}`);
  }
  return `---\n${lines.join("\n")}\n---\n`;
}

/** Renders `## heading` + body, or "" when the body is empty/whitespace-only — callers filter these out so an empty field never leaves a bare heading behind. */
export function markdownSection(heading: string, body: string | null): string {
  if (body === null) return "";
  const trimmed = body.trim();
  return trimmed ? `## ${heading}\n\n${trimmed}` : "";
}

/** Joins non-empty sections/paragraphs with a blank line, dropping empty ones — the shared "skip empty sections" join used by every entity body. */
export function joinSections(parts: Array<string | null | undefined>): string {
  return parts.map((p) => p?.trim() ?? "").filter((p) => p.length > 0).join("\n\n");
}
