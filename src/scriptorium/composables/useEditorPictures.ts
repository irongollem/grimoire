/*
 * What the panel does to a picture, on the chapter editor (#1176).
 *
 * A picture is one of two things that look alike to the DM: an image in the
 * text, or art placed on a page. The Layer control moves it from one to the
 * other (`placeOnPage`, `putInText`), the Place and Stays rows change where
 * placed art sits (`chooseCorner`, `chooseAnchor`), and Replace swaps its file.
 * Everything that touches the editor or the drawn page is here so the panel's
 * sections stay plain props and events.
 */
import type { Ref } from "vue";
import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { offsetWithin, pageAt, type PageBox, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import { createFurnitureItem, FURNITURE_CORNERS, freeCoordinates } from "@/scriptorium/lib/furniture/model";
import { blockTopPct, neighbourBlockId, placementFromBox, type SheetGeometry } from "@/scriptorium/lib/furniture/editorPages";
import { offsetFromDrawnTop } from "@/scriptorium/lib/furniture/anchorOffset";
import { blockPositions, blockTopPx } from "@/scriptorium/lib/furniture/editorAnchors";
import { furniturePlacement } from "@/scriptorium/lib/furniture/renderFurniture";
import { furniturePropsFromImage, imageAttrsFromFurniture } from "@/scriptorium/lib/panel/pictureConversion";
import { followParagraph, stayOnPage } from "@/scriptorium/lib/panel/anchorChange";
import { clearTreatmentPatch, mergeTreatmentPatch, withoutTreatment, type TreatmentPatch } from "@/scriptorium/lib/panel/pictureTreatment";
import { removeNodeAt, updateNodeAttrs } from "@/scriptorium/lib/panel/nodeAttrs";
import type { FurnitureAnchor, PageFurnitureItem } from "@/scriptorium/types";

export type PictureTarget = { source: "node"; pos: number } | { source: "furniture"; id: string };

/** A picture that keeps its place when the text moves it: an image by its block id, art by its own id. */
export type PictureKey = { source: "node"; blockId: string } | { source: "furniture"; id: string };

/** A picture being painted from a description (#1176, Describe it): the job, and the shape it was asked for. */
export interface PendingPicture {
  key: PictureKey;
  jobId: string;
  shape: string;
}

/** What the Stays row needs to know about where a placed picture is drawn now. */
export interface AnchorState {
  /** The page of the chapter it is drawn on, or null when nothing is laid out. */
  page: number | null;
  /** Whether that page has a paragraph to follow. */
  hasParagraph: boolean;
  /** Whether Free is possible: a cornered picture needs its drawn height. */
  canFree: boolean;
}

export interface PictureActions {
  placeOnPage: (pos: number, z?: "under" | "over") => void;
  putInText: (id: string) => void;
  replaceSrc: (target: PictureTarget, src: string) => void;
  remove: (target: PictureTarget) => void;
  /** Where the image node with this block id sits now, or null when it is gone. Positions shift as the document is edited; ids do not. */
  nodePosByBlockId: (blockId: string) => number | null;
  /** The picture's own values (an image node's attrs, or art props): src, original, illuminate, bakedFor. */
  valuesOf: (target: PictureTarget) => Record<string, unknown> | null;
  /** Write a treatment change: one undo step for a picture in the text; art on the page has no undo. */
  treat: (target: PictureTarget, patch: TreatmentPatch) => void;
  chooseCorner: (item: PageFurnitureItem, value: string | undefined) => void;
  chooseAnchor: (item: PageFurnitureItem, value: string | undefined) => void;
  anchorState: (item: PageFurnitureItem) => AnchorState;
  /** The page of the chapter a placed picture is drawn on, or null. */
  pageOf: (item: PageFurnitureItem) => number | null;
  /** The chapter page a picture is on, whichever home it is in, or null when nothing is laid out. */
  pageOfPicture: (target: PictureTarget) => number | null;
  /** New art in front of the text, on the caret's page. */
  addArt: (src: string, extra?: Record<string, unknown>, placement?: Pick<PageFurnitureItem, "z" | "x" | "y" | "width">) => PageFurnitureItem | null;
  /** The picture's key, which survives edits; null for an image that has no block id yet. */
  keyOf: (target: PictureTarget) => PictureKey | null;
  /** The picture a key names now, or null when it is gone. */
  targetOf: (key: PictureKey) => PictureTarget | null;
  /** Mark a picture as being painted (saved with the chapter, so a reload can resume), or clear the mark with null. */
  markPending: (target: PictureTarget, job: { jobId: string; shape: string } | null) => void;
  /** Every picture in the chapter that is still being painted. */
  pendingPictures: () => PendingPicture[];
}

interface Options {
  editor: Ref<Editor | undefined>;
  chapterId: () => string;
  geometry: () => SheetGeometry & { width: number };
  furniture: () => PageFurnitureItem[];
  setFurniture: (items: PageFurnitureItem[]) => void;
  select: (id: string | null) => void;
  /** Where the sheet is drawn: the page elements a picture's place is read from. */
  sheet: () => ParentNode | null;
}

function pagesOf(ed: Editor): PageBox[] {
  return (ed.storage as unknown as { pageFlow?: PageFlowStorage }).pageFlow?.pages ?? [];
}

/** The position just after the top-level block that holds `pos`. */
function afterTopLevelBlock(doc: PMNode, pos: number): number {
  const $pos = doc.resolve(pos);
  return $pos.depth === 0 ? pos + (doc.nodeAt(pos)?.nodeSize ?? 0) : $pos.after(1);
}

/** The first top-level block that starts on or after a doc position, with its stable id. */
function firstBlockFrom(doc: PMNode, startPos: number): { blockId: string; pos: number } | null {
  let found: { blockId: string; pos: number } | null = null;
  doc.forEach((child, offset) => {
    if (found || offset < startPos) return;
    const id: unknown = child.attrs.blockId;
    if (typeof id === "string" && id) found = { blockId: id, pos: offset };
  });
  return found;
}

export function useEditorPictures(opts: Options): PictureActions {
  function live(): Editor | null {
    const ed = opts.editor.value;
    return ed && !ed.isDestroyed ? ed : null;
  }

  function firstBlockOnPage(ed: Editor, page: number) {
    const box = pagesOf(ed).find((p) => p.page === page);
    return box ? firstBlockFrom(ed.state.doc, box.startPos) : null;
  }

  function placeOnPage(pos: number, z: "under" | "over" = "over") {
    const ed = live();
    const node = ed?.state.doc.nodeAt(pos);
    if (!ed || !node || node.type.name !== "image") return;
    const props = furniturePropsFromImage(node.attrs);
    if (!props) return;

    const geometry = opts.geometry();
    const page = pageAt(pagesOf(ed), pos);
    const $from = ed.state.doc.resolve(pos);
    let anchor: FurnitureAnchor = { type: "page", chapterId: opts.chapterId(), page: 1 };
    let placed: { x?: number; y?: number; width?: number } = {};
    if (page) {
      // An image inside a paragraph belongs to that block; a block image to its neighbour.
      const own: unknown = $from.depth >= 1 ? $from.node(1).attrs.blockId : null;
      const siblings = Array.from({ length: ed.state.doc.childCount }, (_, i) => {
        const id: unknown = ed.state.doc.child(i).attrs.blockId;
        return typeof id === "string" && id ? id : null;
      });
      const blockId = typeof own === "string" && own ? own : neighbourBlockId(siblings, $from.index(0));
      anchor = blockId ? { type: "block", blockId } : { type: "page", chapterId: opts.chapterId(), page: page.page };
      const dom = ed.view.nodeDOM(pos);
      if (dom instanceof HTMLElement) {
        // The image may be wrapped; the picture itself is what is drawn.
        const img = dom instanceof HTMLImageElement ? dom : (dom.querySelector("img") ?? dom);
        const { top, left } = offsetWithin(img, ed.view.dom as HTMLElement);
        placed = placementFromBox({ top, left, width: img.offsetWidth }, page, geometry);
        // A picture that follows a paragraph is written as an offset from that paragraph's top, so the
        // paragraph moving to another page takes the picture with it to the same place beside it.
        if (anchor.type === "block" && placed.y !== undefined) {
          const blockPos = blockPositions(ed).get(anchor.blockId);
          const blockPx = blockPos === undefined ? null : blockTopPx(ed, blockPos);
          const blockPct = blockPx === null ? null : blockTopPct(blockPx, page, geometry);
          if (blockPct !== null) placed = { ...placed, y: offsetFromDrawnTop(placed.y, blockPct) };
        }
      }
    }
    const item = createFurnitureItem("art", anchor, { ...placed, z, props });
    removeNodeAt(ed, pos);
    opts.setFurniture([...opts.furniture(), item]);
    opts.select(item.id);
  }

  function putInText(id: string) {
    const ed = live();
    const item = opts.furniture().find((f) => f.id === id);
    if (!ed || !item || item.kind !== "art") return;
    const attrs = imageAttrsFromFurniture(item, opts.geometry().width);
    if (!attrs) return;
    const { doc } = ed.state;
    let at = doc.content.size;
    if (item.anchor.type === "block") {
      const pos = blockPositions(ed).get(item.anchor.blockId);
      if (pos !== undefined) at = afterTopLevelBlock(doc, pos);
    } else if (item.anchor.chapterId === opts.chapterId()) {
      const first = firstBlockOnPage(ed, item.anchor.page);
      if (first) at = afterTopLevelBlock(doc, first.pos);
    }
    const tr = ed.state.tr.insert(at, ed.schema.nodes.image.create(attrs));
    tr.setSelection(NodeSelection.create(tr.doc, at));
    ed.view.dispatch(tr);
    opts.setFurniture(opts.furniture().filter((f) => f.id !== id));
    opts.select(null);
  }

  function replaceSrc(target: PictureTarget, src: string) {
    const ed = live();
    if (target.source === "node") {
      const node = ed?.state.doc.nodeAt(target.pos);
      if (ed && node) updateNodeAttrs(ed, target.pos, { src, ...clearTreatmentPatch(node.attrs) });
      return;
    }
    opts.setFurniture(
      opts.furniture().map((f) =>
        f.id === target.id ? { ...f, props: { ...withoutTreatment(f.props), src } as PageFurnitureItem["props"] } : f,
      ),
    );
  }

  function remove(target: PictureTarget) {
    const ed = live();
    if (target.source === "node") {
      if (ed) removeNodeAt(ed, target.pos);
      return;
    }
    opts.setFurniture(opts.furniture().filter((f) => f.id !== target.id));
    opts.select(null);
  }

  function valuesOf(target: PictureTarget): Record<string, unknown> | null {
    if (target.source === "node") {
      const ed = live();
      const node = ed?.state.doc.nodeAt(target.pos);
      return node && node.type.name === "image" ? { ...node.attrs } : null;
    }
    const item = opts.furniture().find((f) => f.id === target.id);
    return item ? { ...item.props } : null;
  }

  function nodePosByBlockId(blockId: string): number | null {
    const ed = live();
    if (!ed) return null;
    let found: number | null = null;
    ed.state.doc.descendants((node, pos) => {
      if (found !== null) return false;
      if (node.type.name === "image" && node.attrs.blockId === blockId) found = pos;
      return true;
    });
    return found;
  }

  function keyOf(target: PictureTarget): PictureKey | null {
    if (target.source === "furniture") return { source: "furniture", id: target.id };
    const node = live()?.state.doc.nodeAt(target.pos);
    const id: unknown = node?.attrs.blockId;
    return typeof id === "string" && id ? { source: "node", blockId: id } : null;
  }

  function targetOf(key: PictureKey): PictureTarget | null {
    if (key.source === "furniture") return opts.furniture().some((f) => f.id === key.id) ? { source: "furniture", id: key.id } : null;
    const pos = nodePosByBlockId(key.blockId);
    return pos === null ? null : { source: "node", pos };
  }

  function markPending(target: PictureTarget, job: { jobId: string; shape: string } | null) {
    if (target.source === "node") {
      const ed = live();
      if (ed) updateNodeAttrs(ed, target.pos, { pendingJob: job?.jobId ?? null, pendingShape: job?.shape ?? null });
      return;
    }
    opts.setFurniture(
      opts.furniture().map((f) => {
        if (f.id !== target.id) return f;
        const props = { ...f.props };
        delete props.pendingJob;
        delete props.pendingShape;
        return { ...f, props: job ? { ...props, pendingJob: job.jobId, pendingShape: job.shape } : props };
      }),
    );
  }

  function pendingPictures(): PendingPicture[] {
    const found: PendingPicture[] = [];
    const ed = live();
    ed?.state.doc.descendants((node) => {
      const { pendingJob, pendingShape, blockId } = node.attrs;
      if (node.type.name === "image" && typeof pendingJob === "string" && pendingJob && typeof blockId === "string" && blockId) {
        found.push({ key: { source: "node", blockId }, jobId: pendingJob, shape: typeof pendingShape === "string" ? pendingShape : "" });
      }
      return true;
    });
    for (const f of opts.furniture()) {
      const { pendingJob, pendingShape } = f.props;
      if (f.kind === "art" && typeof pendingJob === "string" && pendingJob) {
        found.push({ key: { source: "furniture", id: f.id }, jobId: pendingJob, shape: typeof pendingShape === "string" ? pendingShape : "" });
      }
    }
    return found;
  }

  function treat(target: PictureTarget, patch: TreatmentPatch) {
    if (target.source === "node") {
      const ed = live();
      if (ed) updateNodeAttrs(ed, target.pos, patch);
      return;
    }
    opts.setFurniture(opts.furniture().map((f) => (f.id === target.id ? { ...f, props: mergeTreatmentPatch(f.props, patch) } : f)));
  }

  function placement(item: PageFurnitureItem) {
    return furniturePlacement(item.id, opts.sheet() ?? document);
  }

  function pageOf(item: PageFurnitureItem): number | null {
    const placed = placement(item)?.page;
    if (placed !== undefined) return placed;
    return item.anchor.type === "page" ? item.anchor.page : null;
  }

  function pageOfPicture(target: PictureTarget): number | null {
    if (target.source === "furniture") {
      const item = opts.furniture().find((f) => f.id === target.id);
      return item ? pageOf(item) : null;
    }
    const ed = live();
    return ed ? (pageAt(pagesOf(ed), target.pos)?.page ?? null) : null;
  }

  function freeHere(item: PageFurnitureItem) {
    return freeCoordinates(item, placement(item)?.heightPct ?? null);
  }

  function anchorState(item: PageFurnitureItem): AnchorState {
    const ed = live();
    const page = pageOf(item);
    return {
      page,
      hasParagraph: !!ed && page !== null && firstBlockOnPage(ed, page) !== null,
      canFree: !item.corner || freeHere(item) !== null,
    };
  }

  function chooseCorner(item: PageFurnitureItem, value: string | undefined) {
    if (!value) return;
    const corner = FURNITURE_CORNERS.find((c) => c === value);
    const update = (next: PageFurnitureItem) => opts.setFurniture(opts.furniture().map((f) => (f.id === next.id ? next : f)));
    if (!corner) {
      // Back to free: keep it where it is drawn, as left/top coordinates.
      const here = freeHere(item);
      if (!here) return;
      const free: PageFurnitureItem = { ...item, ...here };
      delete free.corner;
      update(free);
      return;
    }
    // Flush into the corner, on the page it is drawn on now.
    const p = placement(item);
    const anchor: FurnitureAnchor = p ? { type: "page", chapterId: p.chapterId, page: p.page } : item.anchor;
    update({ ...item, corner, x: 0, y: 0, anchor });
  }

  function chooseAnchor(item: PageFurnitureItem, value: string | undefined) {
    const ed = live();
    const p = placement(item);
    if (!ed || !value || value === item.anchor.type) return;
    let next: PageFurnitureItem | null = null;
    if (value === "page") {
      if (!p) return;
      // Where a following picture is drawn is where it stays: the drawn element knows, the offset does not.
      const drawn = opts.sheet()?.querySelector<HTMLElement>(`[data-furniture-id="${item.id}"]`);
      const top = drawn ? parseFloat(drawn.style.top) : NaN;
      next = stayOnPage(item, { chapterId: p.chapterId, page: p.page }, Number.isFinite(top) ? top : null);
    } else {
      const page = pageOf(item);
      const first = page === null ? null : firstBlockOnPage(ed, page);
      const box = page === null ? null : (pagesOf(ed).find((b) => b.page === page) ?? null);
      const px = first ? blockTopPx(ed, first.pos) : null;
      const pct = px === null || !box ? null : blockTopPct(px, box, opts.geometry());
      if (first && pct !== null) next = followParagraph(item, first.blockId, pct);
    }
    if (next) opts.setFurniture(opts.furniture().map((f) => (f.id === item.id ? (next as PageFurnitureItem) : f)));
  }

  function addArt(src: string, extra: Record<string, unknown> = {}, placement: Pick<PageFurnitureItem, "z" | "x" | "y" | "width"> = { z: "over", x: 55, y: 0, width: 35 }): PageFurnitureItem | null {
    const ed = live();
    if (!ed) return null;
    const pos = ed.state.selection.from;
    const page = pageAt(pagesOf(ed), pos);
    const blockId: unknown = ed.state.selection.$from.depth >= 1 ? ed.state.selection.$from.node(1).attrs.blockId : null;
    const anchor: FurnitureAnchor =
      typeof blockId === "string" && blockId
        ? { type: "block", blockId }
        : { type: "page", chapterId: opts.chapterId(), page: page?.page ?? 1 };
    const item = createFurnitureItem("art", anchor, { ...placement, props: { src, ...extra } as Record<string, string | number> });
    opts.setFurniture([...opts.furniture(), item]);
    opts.select(item.id);
    return item;
  }

  return { placeOnPage, putInText, replaceSrc, remove, valuesOf, nodePosByBlockId, treat, chooseCorner, chooseAnchor, anchorState, pageOf, pageOfPicture, addArt, keyOf, targetOf, markPending, pendingPictures };
}
