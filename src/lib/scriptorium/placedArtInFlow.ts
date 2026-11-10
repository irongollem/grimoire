/*
 * Placed art in a reflowed reader (#1175).
 *
 * A picture placed freely on a page is page furniture of kind "art", anchored to
 * a block. A phone has no pages, so the reader shows it in the flow: a
 * full-width picture right after the block it was placed from.
 *
 * `get_player_handout` sends the art as `{ blockId, src }` pairs, already
 * limited to blocks the player may see. That is untrusted input here: an entry
 * without a string blockId and a safe image src is dropped, never guessed at.
 */
import type { JSONContent } from "@tiptap/core";
import { isSafeImageSrc } from "@/lib/tiptap/viewerRender";
import type { PageFurnitureItem } from "@/types/scriptorium.types";

export interface PlacedArt {
  blockId: string;
  src: string;
}

/** Keeps the entries that carry a string blockId and a safe image src. */
export function parsePlacedArt(raw: unknown): PlacedArt[] {
  if (!Array.isArray(raw)) return [];
  const art: PlacedArt[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { blockId, src } = entry as Record<string, unknown>;
    if (typeof blockId !== "string" || blockId === "") continue;
    if (typeof src !== "string" || src === "" || !isSafeImageSrc(src)) continue;
    art.push({ blockId, src });
  }
  return art;
}

/** The block-anchored art of a document's furniture (the DM's own copy, which the RPC does the same for). */
export function placedArtOfFurniture(furniture: readonly PageFurnitureItem[] | null | undefined): PlacedArt[] {
  if (!furniture) return [];
  return parsePlacedArt(
    furniture.flatMap((item) =>
      item.kind === "art" && item.anchor.type === "block" ? [{ blockId: item.anchor.blockId, src: item.props.src }] : [],
    ),
  );
}

function holdsBlock(node: JSONContent, blockId: string): boolean {
  if (node.attrs?.blockId === blockId) return true;
  return node.content?.some((child) => holdsBlock(child, blockId)) ?? false;
}

/**
 * Returns the chapter with an image node after each top-level block that holds
 * the anchored block (the block itself, or one nested inside it, such as a
 * list item: an image between list items would not be valid there). An anchor
 * that matches nothing adds nothing.
 */
export function placedArtInFlow(content: JSONContent, art: readonly PlacedArt[] | undefined): JSONContent {
  if (!art || art.length === 0 || !content.content) return content;
  const blocks: JSONContent[] = [];
  for (const node of content.content) {
    blocks.push(node);
    for (const placed of art) {
      if (!holdsBlock(node, placed.blockId)) continue;
      blocks.push({
        type: "image",
        attrs: { src: placed.src, alt: "", width: "100%", dataAlign: "center", layoutMode: "inline" },
      });
    }
  }
  return { ...content, content: blocks };
}
