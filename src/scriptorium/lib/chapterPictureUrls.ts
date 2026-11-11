/*
 * The pictures a chapter shows, for the player's AI-made label (#1176 story 10): every image in the text and
 * every picture placed on the page. The label itself is found by URL (the provenance registry), so this only
 * has to name the files. Pure.
 */
import type { JSONContent } from "@tiptap/core";

/** Distinct picture URLs in a chapter's content and its placed art, in reading order. */
export function chapterPictureUrls(content: JSONContent, art: readonly { src: string }[]): string[] {
  const found = new Set<string>();
  const walk = (node: JSONContent) => {
    const src = node.type === "image" ? node.attrs?.src : undefined;
    if (typeof src === "string" && src) found.add(src);
    node.content?.forEach(walk);
  };
  walk(content);
  for (const item of art) if (item.src) found.add(item.src);
  return [...found];
}
