/*
 * The pictures and decorations on one page of the open chapter (#1176, frame 02).
 *
 * Both homes of a picture are listed together: an image node sitting in the
 * text on that page, and furniture drawn on it. The panel makes each a row that
 * selects it. Pure over the document, the page boxes and the furniture.
 */
import type { Node as PMNode } from "@tiptap/pm/model";
import type { PageFurnitureItem } from "@/scriptorium/types";
import { pageAt, type PageBox } from "@/scriptorium/tiptap/pageFlow";
import { pageForAnchor } from "@/scriptorium/lib/furniture/editorPages";

export type PageEntry =
  | { key: string; kind: "picture"; source: "node"; pos: number; label: string; src: string | null }
  | { key: string; kind: "picture"; source: "furniture"; id: string; label: string; src: string | null }
  | { key: string; kind: "decoration"; id: string; label: string; src: null };

const DECORATION_LABELS = {
  watercolor: "Watercolour",
  watermark: "Watermark",
  artistCredit: "Artist credit",
} as const;

export function onThisPage(input: {
  doc: PMNode;
  pages: readonly PageBox[];
  page: number;
  chapterId: string;
  furniture: readonly PageFurnitureItem[];
  blockPos: (blockId: string) => number | null;
}): PageEntry[] {
  const out: PageEntry[] = [];
  input.doc.descendants((node, pos) => {
    if (node.type.name !== "image") return true;
    if (pageAt(input.pages, pos)?.page !== input.page) return false;
    const src: unknown = node.attrs.src;
    out.push({
      key: `node:${pos}`,
      kind: "picture",
      source: "node",
      pos,
      label: "Picture in the text",
      src: typeof src === "string" ? src : null,
    });
    return false;
  });
  for (const item of input.furniture) {
    const box = pageForAnchor(item.anchor, input.chapterId, input.pages, input.blockPos);
    if (box?.page !== input.page) continue;
    if (item.kind === "art") {
      const src = item.props.src;
      out.push({
        key: `furniture:${item.id}`,
        kind: "picture",
        source: "furniture",
        id: item.id,
        label: item.z === "under" ? "Picture behind the text" : "Picture in front",
        src: typeof src === "string" && src !== "" ? src : null,
      });
    } else {
      out.push({ key: `furniture:${item.id}`, kind: "decoration", id: item.id, label: DECORATION_LABELS[item.kind], src: null });
    }
  }
  return out;
}
