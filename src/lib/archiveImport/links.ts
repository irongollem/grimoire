/**
 * Links between pages. In the body they are `archiveLink` placeholder nodes
 * (`{ target, label }`), never persisted: the import sweep resolves each one
 * against the records it has created and either turns it into an
 * `entityMention` or leaves the label as plain text.
 */
import { normalizeEntityName } from "@/lib/documentImport/entityName";
import type { ArchiveLinkNode, ArchiveMentionTarget, ArchivePage, TiptapDoc, TiptapNode } from "./types";

export function archiveLinkNode(target: string, label: string): ArchiveLinkNode {
  return { type: "archiveLink", attrs: { target, label } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Path without its extension, lower-cased and slash-normalised: the form targets are compared in. */
function pathKey(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/^\.?\/+/, "")
    .replace(/\.(md|markdown|html?|txt)$/i, "")
    .toLowerCase();
}

/**
 * Resolves a `href` found in a page at `pagePath` into an archive-relative
 * target, or null when it is not an internal link (a scheme, a protocol-
 * relative URL, a bare `#anchor`). The `.html` / `.md` extension and any
 * `#fragment` / `?query` are dropped, so `../NPCs/Bob%20Smith.html#top`
 * becomes `NPCs/Bob Smith`.
 */
export function internalTarget(href: string, pagePath: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  const withoutAnchor = trimmed.split("#")[0].split("?")[0];
  if (!withoutAnchor) return null;
  let decoded = withoutAnchor;
  try {
    decoded = decodeURIComponent(withoutAnchor);
  } catch {
    // A stray % is not an escape; use the text as written.
  }
  const base = pagePath.includes("/") ? pagePath.slice(0, pagePath.lastIndexOf("/")).split("/") : [];
  const parts = decoded.startsWith("/") ? [] : [...base];
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (!parts.length) return null; // escapes the archive root
      parts.pop();
    } else parts.push(segment);
  }
  const joined = parts.join("/").replace(/\.(md|markdown|html?)$/i, "");
  return joined || null;
}

/**
 * Finds the page a link target names: by path (an exact path, or a path
 * suffix, so a wikilink `NPCs/Bob` finds `Vault/NPCs/Bob.md`), then by title,
 * then by normalised name over titles and aliases (so "the Bobs" finds "Bob").
 * Returns null when nothing matches or the name is ambiguous across pages.
 */
export function findPageForLink(target: string, pages: readonly ArchivePage[]): ArchivePage | null {
  const wanted = pathKey(target);
  if (!wanted) return null;

  const byPath = pages.filter((p) => {
    const key = pathKey(p.path);
    return key === wanted || key.endsWith(`/${wanted}`);
  });
  if (byPath.length === 1) return byPath[0];
  if (byPath.length > 1) {
    const exact = byPath.find((p) => pathKey(p.path) === wanted);
    if (exact) return exact;
  }

  const lastSegment = target.replace(/\\/g, "/").split("/").pop()?.replace(/\.(md|markdown|html?)$/i, "") ?? target;
  const lowered = lastSegment.trim().toLowerCase();
  const byTitle = pages.filter((p) => p.title.trim().toLowerCase() === lowered);
  if (byTitle.length === 1) return byTitle[0];

  const normalized = normalizeEntityName(lastSegment.replace(/[-_]+/g, " "));
  if (!normalized) return null;
  const byName = pages.filter((p) => [p.title, ...p.aliases].some((n) => normalizeEntityName(n) === normalized));
  return byName.length === 1 ? byName[0] : null;
}

/**
 * Replaces every `archiveLink` in a document: with an `entityMention` when the
 * resolver knows the target, otherwise with the label as plain text. Pure; the
 * input document is not mutated. Marks on the placeholder (a link inside bold
 * text) stay on the text fallback and are dropped from a mention, which is an
 * atom.
 */
export function resolveArchiveLinks(
  doc: TiptapDoc,
  resolve: (target: string, label: string) => ArchiveMentionTarget | null,
): TiptapDoc {
  const walk = (nodes: TiptapNode[]): TiptapNode[] =>
    nodes.flatMap((node): TiptapNode[] => {
      if (node.type === "archiveLink" && isRecord(node.attrs)) {
        const target = typeof node.attrs.target === "string" ? node.attrs.target : "";
        const label = typeof node.attrs.label === "string" ? node.attrs.label : "";
        const hit = resolve(target, label);
        if (hit) return [{ type: "entityMention", attrs: { id: hit.id, entityType: hit.entityType } }];
        if (!label) return [];
        return [node.marks ? { type: "text", text: label, marks: node.marks } : { type: "text", text: label }];
      }
      if (Array.isArray(node.content)) return [{ ...node, content: walk(node.content as TiptapNode[]) }];
      return [node];
    });
  return { type: "doc", content: walk(doc.content) };
}

/** Distinct targets of every `archiveLink` in a node list, in document order. */
export function collectLinkTargets(nodes: readonly TiptapNode[]): string[] {
  const seen = new Set<string>();
  const walk = (list: readonly TiptapNode[]): void => {
    for (const node of list) {
      if (node.type === "archiveLink" && isRecord(node.attrs) && typeof node.attrs.target === "string" && node.attrs.target) {
        seen.add(node.attrs.target);
      }
      if (Array.isArray(node.content)) walk(node.content as TiptapNode[]);
    }
  };
  walk(nodes);
  return [...seen];
}
