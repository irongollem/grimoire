/**
 * Shared steps of turning one file into an `ArchivePage`: path bookkeeping,
 * title picking, empty-paragraph trimming. The Markdown and HTML readers call
 * these so their pages come out the same shape.
 */
import { normalizeEntityName } from "@/lib/documentImport/entityName";
import type { TiptapDoc, TiptapNode } from "./types";

export function folderOf(path: string): string[] {
  const parts = path.split("/");
  parts.pop();
  return parts;
}

export function baseName(path: string): string {
  const file = path.split("/").pop() ?? path;
  return file.replace(/\.[^.]+$/, "");
}

export function plainTextOf(node: TiptapNode): string {
  if (typeof node.text === "string") return node.text;
  if (node.type === "archiveLink" && typeof node.attrs === "object" && node.attrs) {
    const label = (node.attrs as { label?: unknown }).label;
    return typeof label === "string" ? label : "";
  }
  return Array.isArray(node.content) ? (node.content as TiptapNode[]).map(plainTextOf).join("") : "";
}

/** True when two titles are the same up to case, punctuation and whitespace. */
export function sameTitle(a: string, b: string): boolean {
  const na = normalizeEntityName(a);
  return na !== null && na === normalizeEntityName(b);
}

/** Drops empty paragraphs at either end of a body (left behind by dropped embeds and HTML wrappers). */
export function trimBody(nodes: TiptapNode[]): TiptapNode[] {
  const blank = (n: TiptapNode) => n.type === "paragraph" && !n.content;
  let start = 0;
  let end = nodes.length;
  while (start < end && blank(nodes[start])) start++;
  while (end > start && blank(nodes[end - 1])) end--;
  return nodes.slice(start, end);
}

/** A body with no text anywhere (blank, rules only): not worth a record. */
export function isEmptyBody(nodes: readonly TiptapNode[]): boolean {
  return nodes.every((n) => plainTextOf(n).trim() === "");
}

export function docOf(nodes: TiptapNode[]): TiptapDoc {
  return { type: "doc", content: nodes.length ? nodes : [{ type: "paragraph" }] };
}
