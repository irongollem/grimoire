<template>
  <!-- Furniture in front of the text (and the selected item, whatever its layer)
       is drawn here, above the editor; art behind the text is drawn by the same
       code into the editor's own underlay (FurnitureUnderlay). The layer takes
       no pointer events itself: the items do, so the text stays writable. -->
  <div ref="overlayRef" class="sc-editor-furniture" aria-hidden="true" />
</template>

<script setup lang="ts">
/**
 * Page furniture on the chapter editor's real pages (#1175).
 *
 * Imperative on purpose, like the preview's render pass: the elements are the
 * ones `buildFurnitureElement` makes, so the editor and the preview draw an
 * item identically. A redraw happens when the furniture, the selection or the
 * page boxes change; a drag is committed on pointer-up, so nothing is redrawn
 * under the pointer.
 */
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Editor } from "@tiptap/core";
import type { PageFurnitureItem } from "@/scriptorium/types";
import { pageAt, type PageBox, type PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import type { FurnitureUnderlayStorage } from "@/scriptorium/tiptap/furnitureUnderlay";
import { buildFurnitureElement, makeGrabbable } from "@/scriptorium/lib/furniture/renderFurniture";
import {
  blockTopPct,
  itemsByPage,
  missingPageNumber,
  pageRect,
  type SheetGeometry,
} from "@/scriptorium/lib/furniture/editorPages";
import { followsBlock, placeAtAnchor, reanchored } from "@/scriptorium/lib/furniture/anchorOffset";
import { buildAnchorMark, buildGoneNote } from "@/scriptorium/lib/furniture/anchorMark";
import { blockPositions, blockTopPx } from "@/scriptorium/lib/furniture/editorAnchors";
import {
  behindHandleFor,
  behindPick,
  pointOnGlyph,
  resizeCorner,
  type BehindBox,
  type PointerPoint,
} from "@/scriptorium/lib/furniture/behindHit";

const { editor, chapterId, furniture, selectedId, geometry } = defineProps<{
  editor: Editor | null | undefined;
  chapterId: string;
  furniture: PageFurnitureItem[];
  selectedId: string | null;
  geometry: SheetGeometry;
}>();

const emit = defineEmits<{
  /** A new layout moved these pictures to another page with their paragraph (the pages they are on now). */
  moved: [pages: number[]];
  /** The anchor mark was dragged onto another paragraph. */
  "update:furniture": [items: PageFurnitureItem[]];
}>();

/** The editor's own storage entries; the extensions are registered only in the chapter editor. */
function storageOf(ed: Editor) {
  return ed.storage as unknown as { pageFlow?: PageFlowStorage; furnitureUnderlay?: FurnitureUnderlayStorage };
}

const overlayRef = ref<HTMLElement | null>(null);
const PAGE_CLASS = "sc-editor-furniture-page";

function pageBox(rect: ReturnType<typeof pageRect>, page: number): HTMLElement {
  const box = document.createElement("div");
  box.className = PAGE_CLASS;
  // So a drag can tell which page of which chapter a box is (snapping to its corners).
  box.dataset.chapterId = chapterId;
  box.dataset.chapterPage = String(page);
  box.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none`;
  return box;
}

/** Bumped when the furniture, selection, chapter or geometry change: the inputs a measure alone cannot. */
let inputs = 0;
/** What the last draw drew: the page measure runs after every keystroke, and most of them move no picture. */
let drawn = "";

/** Where each item was drawn last time, so a layout that carries a picture to another page with its paragraph can say so. */
const lastPlaced = new Map<string, { page: number; blockId: string }>();

/** An anchor block's top on its page, in the sheet's px and in % of the page, or null when it is not drawn. */
function anchorTop(ed: Editor, item: PageFurnitureItem, page: PageBox, blocks: Map<string, number>) {
  if (!followsBlock(item) || item.anchor.type !== "block") return null;
  const pos = blocks.get(item.anchor.blockId);
  const px = pos === undefined ? null : blockTopPx(ed, pos);
  const pct = px === null ? null : blockTopPct(px, page, geometry);
  return px === null || pct === null ? null : { pct, px: px - pageRect(page, geometry).top };
}

function draw() {
  const overlay = overlayRef.value;
  const ed = editor;
  if (!overlay || !ed || ed.isDestroyed) return;
  const underlay = storageOf(ed).furnitureUnderlay?.element ?? null;

  // Write mode has no pages, so there is nothing to draw furniture on.
  const flow = storageOf(ed).pageFlow;
  const pages = flow?.pages ?? [];
  const blocks = blockPositions(ed);
  const grouped = itemsByPage(furniture, chapterId, pages, (id) => blocks.get(id) ?? null);
  const tops = new Map<string, ReturnType<typeof anchorTop>>();
  for (const [page, items] of grouped) for (const item of items) tops.set(item.id, anchorTop(ed, item, page, blocks));
  const signature = [
    inputs,
    underlay ? 1 : 0,
    ...[...grouped].map(
      ([page, items]) =>
        `${page.page}@${page.contentTop}:${items.map((i) => `${i.id}~${Math.round((tops.get(i.id)?.pct ?? -1) * 10)}`).join(",")}`,
    ),
  ].join("|");
  if (signature === drawn) return;
  drawn = signature;
  overlay.replaceChildren();
  hoverEl = null;
  hoverId = null;
  selectedEl = null;
  underlay?.replaceChildren();

  const placements: { el: HTMLElement; item: PageFurnitureItem; box: HTMLElement; top: number }[] = [];
  const marks: { page: PageBox; item: PageFurnitureItem; el: HTMLElement; px: number | null }[] = [];
  for (const [page, items] of grouped) {
    const rect = pageRect(page, geometry);
    const front = pageBox(rect, page.page);
    const behind = pageBox(rect, page.page);
    for (const item of items) {
      const el = buildFurnitureElement(item);
      const selected = item.id === selectedId;
      if (item.z === "under") {
        // Behind the text, selected or not: it stays under the words. Selection is
        // a frame drawn above them (showSelected), and a press reaches it through hitTest.
        behind.appendChild(el);
        placeLater(placements, el, item, behind, tops.get(item.id)?.pct);
      } else {
        makeGrabbable(el, item, selected);
        front.appendChild(el);
        placeLater(placements, el, item, front, tops.get(item.id)?.pct);
      }
      marks.push({ page, item, el, px: tops.get(item.id)?.px ?? null });
    }
    if (front.childElementCount) overlay.appendChild(front);
    if (behind.childElementCount && underlay) underlay.appendChild(behind);
  }
  // Placed once they are in the page: a picture's height is only known there.
  for (const p of placements) placeAtAnchor(p.el, p.item, p.box, p.top);
  drawNotes(overlay, marks, pages);
  trackMoves(grouped);
  showSelected();
}

function placeLater(
  list: { el: HTMLElement; item: PageFurnitureItem; box: HTMLElement; top: number }[],
  el: HTMLElement,
  item: PageFurnitureItem,
  box: HTMLElement,
  top: number | undefined,
) {
  if (top !== undefined) list.push({ el, item, box, top });
}

/** The anchor mark for the selected picture that follows a paragraph, and a note on any whose page is gone. */
function drawNotes(
  overlay: HTMLElement,
  drawnItems: { page: PageBox; item: PageFurnitureItem; el: HTMLElement; px: number | null }[],
  pages: readonly PageBox[],
) {
  for (const { page, item, el, px } of drawnItems) {
    const rect = pageRect(page, geometry);
    const drawnTop = parseFloat(el.style.top);
    const gone = missingPageNumber(item.anchor, chapterId, pages);
    const wantsMark = item.id === selectedId && px !== null && Number.isFinite(drawnTop);
    if (gone === null && !wantsMark) continue;
    const box = pageBox(rect, page.page);
    if (wantsMark && px !== null) {
      box.appendChild(
        buildAnchorMark(item.id, {
          anchorTop: px,
          itemLeft: (item.x / 100) * rect.width,
          itemTop: (drawnTop / 100) * rect.height,
        }),
      );
    }
    if (gone !== null) {
      const corner = item.corner;
      const left = corner ? (corner.endsWith("left") ? 2 : 40) : item.x;
      const top = corner ? (corner.startsWith("top") ? 2 : 94) : item.y;
      box.appendChild(buildGoneNote(gone, left, top));
    }
    overlay.appendChild(box);
  }
}

/** Tells the shell about every picture a new layout carried to another page with its paragraph. */
function trackMoves(grouped: Map<PageBox, PageFurnitureItem[]>) {
  const movedTo: number[] = [];
  const seen = new Set<string>();
  for (const [page, items] of grouped) {
    for (const item of items) {
      seen.add(item.id);
      if (!followsBlock(item) || item.anchor.type !== "block") {
        lastPlaced.delete(item.id);
        continue;
      }
      const before = lastPlaced.get(item.id);
      // Only the same paragraph on another page is the layout's doing; a new anchor is the DM's own.
      if (before && before.blockId === item.anchor.blockId && before.page !== page.page) movedTo.push(page.page);
      lastPlaced.set(item.id, { page: page.page, blockId: item.anchor.blockId });
    }
  }
  for (const id of lastPlaced.keys()) if (!seen.has(id)) lastPlaced.delete(id);
  if (movedTo.length) emit("moved", movedTo);
}

// ── The anchor mark: drag it onto another paragraph (#1176) ──────────────────
// No keyboard route: a picture's anchor is changed by pointer, and the
// inspector's "Moves with its paragraph" / "Stays on page" stays the other way.

interface MarkDrag {
  id: string;
  mark: HTMLElement;
  startY: number;
  scale: number;
}
let markDrag: MarkDrag | null = null;

function onOverlayDown(e: PointerEvent) {
  const mark = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-anchor-mark]") : null;
  const overlay = overlayRef.value;
  if (!mark || !overlay) return;
  // The sheet's own pointerdown deselects; this press is not a click on the page.
  e.stopPropagation();
  e.preventDefault();
  const o = overlay.getBoundingClientRect();
  markDrag = {
    id: mark.dataset.anchorMark ?? "",
    mark,
    startY: e.clientY,
    scale: overlay.offsetWidth > 0 ? o.width / overlay.offsetWidth : 1,
  };
  // Out of the way, so the text under the pointer can be found when it is let go.
  mark.style.pointerEvents = "none";
  window.addEventListener("pointermove", onMarkMove);
  window.addEventListener("pointerup", onMarkUp, { once: true });
}

function onMarkMove(e: PointerEvent) {
  if (!markDrag) return;
  markDrag.mark.style.transform = `translateY(${(e.clientY - markDrag.startY) / markDrag.scale}px)`;
}

/** The top-level block under a point, by its stable id. */
function blockIdAt(ed: Editor, x: number, y: number): string | null {
  const hit = ed.view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const $pos = ed.state.doc.resolve(hit.pos);
  const node = $pos.depth >= 1 ? $pos.node(1) : ($pos.nodeAfter ?? $pos.nodeBefore);
  const id: unknown = node?.attrs.blockId;
  return typeof id === "string" && id ? id : null;
}

function onMarkUp(e: PointerEvent) {
  window.removeEventListener("pointermove", onMarkMove);
  const d = markDrag;
  markDrag = null;
  const ed = editor;
  if (!d || !ed || ed.isDestroyed) return;
  d.mark.style.transform = "";
  d.mark.style.pointerEvents = "";
  const item = furniture.find((i) => i.id === d.id);
  const blockId = blockIdAt(ed, e.clientX, e.clientY);
  if (!item || !blockId || (item.anchor.type === "block" && item.anchor.blockId === blockId)) return;
  const blocks = blockPositions(ed);
  const pos = blocks.get(blockId);
  const page = pos === undefined ? null : pageAt(storageOf(ed).pageFlow?.pages ?? [], pos);
  const px = pos === undefined ? null : blockTopPx(ed, pos);
  const drawnEl =
    overlayRef.value?.querySelector<HTMLElement>(`[data-furniture-id="${d.id}"]`) ??
    storageOf(ed).furnitureUnderlay?.element?.querySelector<HTMLElement>(`[data-furniture-id="${d.id}"]`);
  const drawnTop = drawnEl ? parseFloat(drawnEl.style.top) : NaN;
  const newTop = page && px !== null ? blockTopPct(px, page, geometry) : null;
  if (newTop === null || !Number.isFinite(drawnTop)) return;
  lastPlaced.delete(d.id);
  emit(
    "update:furniture",
    furniture.map((i) => (i.id === d.id ? reanchored(i, drawnTop, blockId, newTop) : i)),
  );
}

// ── Pictures behind the text, reached from the page (#1175) ────────────────
// They sit under the words, so the layer answers for them: a press where there
// is no text, or the handle shown while the pointer is over one.

/** The behind-the-text pictures as drawn, in draw order, with their client-space boxes. */
function behindElements(): { el: HTMLElement; box: BehindBox }[] {
  const root = editor ? storageOf(editor).furnitureUnderlay?.element : null;
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>("[data-furniture-id]")].map((el) => {
    const r = el.getBoundingClientRect();
    return { el, box: { id: el.dataset.furnitureId ?? "", left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  });
}

type CaretDoc = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/** The text node and offset nearest the point, by whichever API the browser has. */
function caretAt(p: PointerPoint): { node: Node; offset: number } | null {
  const doc = document as CaretDoc;
  if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(p.x, p.y);
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null;
  }
  const range = doc.caretRangeFromPoint?.(p.x, p.y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/**
 * Whether the point is on a glyph. The caret lookup answers with the nearest
 * offset even in empty space (it snaps to the line's end), so the character
 * either side of it is measured and the point must fall inside one of them.
 */
function isOverGlyph(p: PointerPoint): boolean {
  const ed = editor;
  if (!ed || ed.isDestroyed) return false;
  const caret = caretAt(p);
  if (!caret || !(caret.node instanceof Text) || !ed.view.dom.contains(caret.node)) return false;
  const length = caret.node.length;
  const rects: DOMRect[] = [];
  for (const [from, to] of [
    [caret.offset - 1, caret.offset],
    [caret.offset, caret.offset + 1],
  ]) {
    if (from < 0 || to > length) continue;
    const range = document.createRange();
    range.setStart(caret.node, from);
    range.setEnd(caret.node, to);
    rects.push(...range.getClientRects());
  }
  return pointOnGlyph(p, rects);
}

let hoverEl: HTMLElement | null = null;
let hoverId: string | null = null;

function clearHover() {
  hoverEl?.remove();
  hoverEl = null;
  hoverId = null;
}

const SVG_NS = "http://www.w3.org/2000/svg";
function gripGlyph(): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 6 10");
  svg.setAttribute("width", "6");
  svg.setAttribute("height", "10");
  for (const cy of [1.5, 5, 8.5]) {
    for (const cx of [1.5, 4.5]) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "1");
      dot.setAttribute("fill", "currentColor");
      svg.appendChild(dot);
    }
  }
  return svg;
}

/**
 * A frame for a picture behind the text, drawn above the words: an outline, a
 * "Picture" pill at its top-left and, when selected, a resize knob. The frame
 * takes no pointer events except the pill and the knob.
 */
function buildFrame(id: string, rect: DOMRect, selected: boolean): HTMLElement | null {
  const overlay = overlayRef.value;
  if (!overlay) return null;
  // The sheet is drawn at a transform scale; the overlay is in unscaled px.
  const o = overlay.getBoundingClientRect();
  const scale = overlay.offsetWidth > 0 ? o.width / overlay.offsetWidth : 1;
  const wrap = document.createElement("div");
  wrap.className = "sc-editor-hover";
  wrap.style.cssText = [
    "position:absolute",
    `left:${(rect.left - o.left) / scale}px`,
    `top:${(rect.top - o.top) / scale}px`,
    `width:${rect.width / scale}px`,
    `height:${rect.height / scale}px`,
    "pointer-events:none",
  ].join(";");
  // Imperative elements like the furniture itself, so plain elements with a role rather than AppButton.
  const handle = document.createElement("div");
  handle.className = "sc-editor-hover-handle";
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", "Move picture behind the text");
  handle.dataset.furnitureHandle = id;
  handle.append(gripGlyph(), document.createTextNode("Picture"));
  wrap.appendChild(handle);
  if (selected) {
    const corner = furniture.find((i) => i.id === id)?.corner;
    wrap.classList.add("sc-editor-hover--selected");
    // The pill sits top-left; a picture pinned bottom-right resizes from there, so the pill steps aside.
    if (resizeCorner(corner) === "top-left") wrap.classList.add("sc-editor-hover--pill-low");
    if (corner) wrap.classList.add("sc-editor-hover--pinned");
    // Inside useFurnitureEditing's resize zone: the knob is flush in the corner it resizes from.
    const knob = document.createElement("div");
    knob.className = `sc-editor-hover-knob sc-editor-hover-knob--${resizeCorner(corner)}`;
    knob.setAttribute("role", "button");
    knob.setAttribute("aria-label", "Resize picture");
    knob.dataset.furnitureHandle = id;
    wrap.appendChild(knob);
  }
  overlay.appendChild(wrap);
  return wrap;
}

function showHover(id: string, rect: DOMRect) {
  clearHover();
  hoverEl = buildFrame(id, rect, false);
  hoverId = hoverEl ? id : null;
}

let selectedEl: HTMLElement | null = null;

function underlayElement(id: string): HTMLElement | null {
  return behindElements().find((f) => f.box.id === id)?.el ?? null;
}

/** The selected behind-the-text picture's frame, from where its element is now. */
function showSelected() {
  selectedEl?.remove();
  selectedEl = null;
  const el = selectedId === null ? null : underlayElement(selectedId);
  if (el && selectedId !== null) selectedEl = buildFrame(selectedId, el.getBoundingClientRect(), true);
}

/** Hidden while a drag moves the picture under it (redrawn from the picture on release), so it never lags. */
function holdFrameForDrag() {
  if (!selectedEl) return;
  selectedEl.style.display = "none";
  window.addEventListener("pointerup", showSelected, { once: true });
}

/**
 * The pointer moved over the sheet (client px). Shows or moves the handle, and
 * says whether a press here would pick a picture (the editor sets the cursor).
 */
function hover(p: PointerPoint): boolean {
  const found = behindElements();
  const boxes = found.map((f) => f.box);
  const id = behindHandleFor(p, boxes);
  if (id === null) {
    clearHover();
    return false;
  }
  // The selected picture already has its frame.
  if (id === selectedId) clearHover();
  else if (id !== hoverId) {
    const target = found.find((f) => f.box.id === id);
    if (target) showHover(id, target.el.getBoundingClientRect());
  }
  return behindPick(p, boxes, isOverGlyph(p)) !== null;
}

/** The picture element a press means: the handle's picture, or the one under a press on no text. */
function hitTest(e: PointerEvent): HTMLElement | null {
  const found = behindElements();
  const handle = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-furniture-handle]") : null;
  const id = handle
    ? (handle.dataset.furnitureHandle ?? null)
    : behindPick(
        { x: e.clientX, y: e.clientY },
        found.map((f) => f.box),
        isOverGlyph({ x: e.clientX, y: e.clientY }),
      );
  const hit = found.find((f) => f.box.id === id)?.el ?? null;
  if (hit && id === selectedId) holdFrameForDrag();
  return hit;
}

defineExpose({ hitTest, hover, clearHover });

let flow: PageFlowStorage | undefined;
let underlay: FurnitureUnderlayStorage | undefined;
function subscribe(ed: Editor | null | undefined) {
  unsubscribe();
  if (!ed) return;
  flow = storageOf(ed).pageFlow;
  underlay = storageOf(ed).furnitureUnderlay;
  flow?.listeners.add(draw);
  underlay?.listeners.add(draw);
  draw();
}
function unsubscribe() {
  flow?.listeners.delete(draw);
  underlay?.listeners.delete(draw);
  flow = undefined;
  underlay = undefined;
}

onMounted(() => {
  subscribe(editor);
  overlayRef.value?.addEventListener("pointerdown", onOverlayDown);
});
watch(() => editor, subscribe);
watch(
  () => [furniture, selectedId, chapterId, geometry] as const,
  () => {
    inputs++;
    draw();
  },
  { flush: "post" },
);
onBeforeUnmount(() => {
  unsubscribe();
  overlayRef.value?.removeEventListener("pointerdown", onOverlayDown);
  window.removeEventListener("pointermove", onMarkMove);
});
</script>
