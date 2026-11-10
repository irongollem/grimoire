import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import { FLOW_LAYOUT_CLASSES, type ChapterFlow, type FlowPosition } from "@/lib/scriptorium/pageFlow/types";
import { locateLayoutOffset } from "@/lib/scriptorium/pageFlow/layoutText";

/*
 * PageFlow (#1175): the editor shows the pages the preview lays out.
 *
 * The preview (Paged.js) is what prints, so it tells the editor where each
 * page and column starts (a ChapterFlow). This extension draws that: a gap
 * between sheets where a page starts, and in a two-column chapter a forced
 * column break where the second column starts. Both are widget decorations,
 * so they never enter the document.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageFlow: {
      /** Show the pages of a laid-out chapter in the editor; null clears them. */
      setChapterFlow: (flow: ChapterFlow | null) => ReturnType;
    };
  }
}

/** A page of the chapter as the editor lays it out, for things placed on a page. */
export interface PageBox {
  page: number;
  /** Doc position where the page begins (0 for page 1). */
  startPos: number;
  /** Unscaled px from the root's top border edge to the top of this page's text area. */
  contentTop: number;
  contentHeight: number;
}

export interface PageFlowStorage {
  pages: PageBox[];
  listeners: Set<() => void>;
}

interface ResolvedBreak {
  kind: "page" | "column";
  page: number;
  pos: number;
  inline: boolean;
  /** A column break that ends its page: drawn before the page gap at the same position. */
  pageEnd: boolean;
}

interface FlowState {
  flow: ChapterFlow | null;
  breaks: ResolvedBreak[];
}

/** The visible gap between two sheets, in px (the app background showing between papers). */
export const SHEET_GAP = 24;

const key = new PluginKey<FlowState>("pageFlow");

/** The page a doc position falls on: the last page that starts at or before it. */
export function pageAt(pages: readonly PageBox[], pos: number): PageBox | null {
  let found: PageBox | null = null;
  for (const p of pages) {
    if (p.startPos <= pos) found = p;
    else break;
  }
  return found;
}

export interface PageGeometry {
  contentHeight: number;
  marginTop: number;
  marginBottom: number;
  sheetGap: number;
}

/**
 * Heights for the gaps before pages 2..n and for the tail, given how much of
 * each page's text area its text used. A gap fills what page k-1 left empty,
 * then its bottom margin, the gap between sheets, and page k's top margin.
 * The tail only fills: the root's own bottom padding is the last page's margin.
 */
export function gapHeights(used: readonly number[], g: PageGeometry): { gaps: number[]; tail: number } {
  const fill = (u: number) => Math.max(0, g.contentHeight - u);
  const gaps = used.slice(0, -1).map((u) => fill(u) + g.marginBottom + g.sheetGap + g.marginTop);
  const last = used[used.length - 1];
  return { gaps, tail: last === undefined ? 0 : fill(last) };
}

/** Resolve the flow's positions to document positions. Needs the DOM to count layout text. */
function resolveFlow(view: EditorView, flow: ChapterFlow): ResolvedBreak[] {
  const byId = new Map<string, number>();
  view.state.doc.descendants((node, pos) => {
    const id: unknown = node.attrs.blockId;
    if (typeof id === "string" && !byId.has(id)) byId.set(id, pos);
  });

  const locate = (at: FlowPosition): { pos: number; inline: boolean } | null => {
    const blockPos = byId.get(at.blockId);
    if (blockPos === undefined) return null;
    if (at.textOffset > 0) {
      const dom = view.nodeDOM(blockPos);
      const hit = dom ? locateLayoutOffset(dom, at.textOffset) : null;
      if (hit) {
        const pos = view.posAtDOM(hit.node, hit.offset);
        if (view.state.doc.resolve(pos).parent.inlineContent) return { pos, inline: true };
      }
    }
    return { pos: blockPos, inline: false };
  };

  const out: ResolvedBreak[] = [];
  // Page breaks first, so a page-end column break can find the next one.
  for (const b of flow.breaks) {
    if (b.kind !== "page" || b.at === "page-end") continue;
    const hit = locate(b.at);
    if (hit) out.push({ kind: "page", page: b.page, ...hit, pageEnd: false });
  }
  const pageBreaks = [...out];
  for (const b of flow.breaks) {
    if (b.kind !== "column") continue;
    if (b.at === "page-end") {
      const next = pageBreaks.find((p) => p.page === b.page + 1);
      out.push({
        kind: "column",
        page: b.page,
        pos: next ? next.pos : view.state.doc.content.size,
        inline: next ? next.inline : false,
        pageEnd: true,
      });
    } else {
      const hit = locate(b.at);
      if (hit) out.push({ kind: "column", page: b.page, ...hit, pageEnd: false });
    }
  }
  return out.sort((a, b) => a.pos - b.pos);
}

function widgetEl(inline: boolean, className: string): HTMLElement {
  // A span inside a paragraph cannot be a div; display:block makes it behave like one.
  const el = document.createElement(inline ? "span" : "div");
  el.className = className;
  if (inline) el.style.display = "block";
  el.contentEditable = "false";
  el.setAttribute("aria-hidden", "true");
  return el;
}

function gapWidget(b: ResolvedBreak): Decoration {
  return Decoration.widget(
    b.pos,
    () => {
      const el = widgetEl(b.inline, "sc-flow-gap");
      el.dataset.page = String(b.page);
      el.style.setProperty("--sc-sheet-gap", `${SHEET_GAP}px`);
      const band = document.createElement("span");
      band.className = "sc-flow-gap-band";
      band.textContent = `Page ${b.page}`;
      el.appendChild(band);
      return el;
    },
    { key: `gap-${b.page}-${b.inline}`, side: 0, ignoreSelection: true },
  );
}

function columnWidget(b: ResolvedBreak): Decoration {
  return Decoration.widget(
    b.pos,
    () => {
      const el = widgetEl(b.inline, "sc-flow-colbreak");
      el.dataset.page = String(b.page);
      return el;
    },
    // Keyed without the position, so typing before it does not rebuild the element.
    { key: `col-${b.page}-${b.pageEnd}-${b.inline}`, side: b.pageEnd ? -1 : 0, ignoreSelection: true },
  );
}

const ALLOWED_LAYOUT_CLASSES: ReadonlySet<string> = new Set(FLOW_LAYOUT_CLASSES);

/**
 * The preview's preparation reshapes some blocks before layout (a table set
 * across both columns, a picture grouped with its paragraph). The editor gives
 * the same blocks the same classes, so they take the same shape here.
 */
function layoutClassDecorations(state: EditorState, flow: ChapterFlow): Decoration[] {
  const wanted = new Map<string, string>();
  for (const [id, classes] of Object.entries(flow.layoutClasses)) {
    const allowed = classes.filter((c) => ALLOWED_LAYOUT_CLASSES.has(c));
    if (allowed.length > 0) wanted.set(id, allowed.join(" "));
  }
  if (wanted.size === 0) return [];
  const out: Decoration[] = [];
  state.doc.descendants((node, pos) => {
    const id: unknown = node.attrs.blockId;
    const cls = typeof id === "string" ? wanted.get(id) : undefined;
    if (cls) out.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }));
  });
  return out;
}

function buildDecorations(state: EditorState): DecorationSet {
  const fs = key.getState(state);
  if (!fs || !fs.flow) return DecorationSet.empty;
  const decos = fs.breaks.map((b) => (b.kind === "page" ? gapWidget(b) : columnWidget(b)));
  decos.push(...layoutClassDecorations(state, fs.flow));
  decos.push(
    Decoration.widget(
      state.doc.content.size,
      () => {
        const el = widgetEl(false, "sc-flow-tail");
        return el;
      },
      { key: "tail", side: 1, ignoreSelection: true },
    ),
  );
  return DecorationSet.create(state.doc, decos);
}

function cssPx(style: CSSStyleDeclaration, name: string): number {
  return Number.parseFloat(style.getPropertyValue(name));
}

/**
 * offsetTop / offsetLeft summed up to `root`: unscaled px, unaffected by the
 * sheet's CSS transform. The editor measures every page and placed picture
 * with this, never with getBoundingClientRect.
 */
export function offsetWithin(el: HTMLElement, root: HTMLElement): { top: number; left: number } {
  let top = 0;
  let left = 0;
  let cur: HTMLElement | null = el;
  while (cur && cur !== root) {
    top += cur.offsetTop;
    left += cur.offsetLeft;
    const parent: Element | null = cur.offsetParent;
    cur = parent instanceof HTMLElement ? parent : null;
  }
  return { top, left };
}

export const PageFlow = Extension.create<Record<string, never>, PageFlowStorage>({
  name: "pageFlow",

  addStorage() {
    return { pages: [], listeners: new Set<() => void>() };
  },

  addCommands() {
    return {
      setChapterFlow:
        (flow) =>
        ({ tr, dispatch }) => {
          if (dispatch) dispatch(tr.setMeta(key, { flow }).setMeta("addToHistory", false));
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<FlowState>({
        key,
        state: {
          init: () => ({ flow: null, breaks: [] }),
          apply(tr, value) {
            const meta: unknown = tr.getMeta(key);
            if (meta && typeof meta === "object") {
              if ("flow" in meta) {
                const flow = (meta as { flow: ChapterFlow | null }).flow;
                // Keep the old breaks until the new flow resolves, so the gaps do not flicker.
                return { flow, breaks: flow ? value.breaks : [] };
              }
              if ("breaks" in meta) return { ...value, breaks: (meta as { breaks: ResolvedBreak[] }).breaks };
            }
            if (!tr.docChanged || value.breaks.length === 0) return value;
            // Typed text keeps each gap on the text it was drawn before (assoc -1: a
            // character typed at a page's first position stays on that page).
            return { ...value, breaks: value.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos, -1) })) };
          },
        },
        props: {
          decorations: buildDecorations,
          attributes(state): Record<string, string> {
            return key.getState(state)?.flow?.twoColumn ? { class: "phb-two-col sc-flow-columns" } : {};
          },
        },
        view(view) {
          let frame = 0;

          const measure = () => {
            frame = 0;
            if (view.isDestroyed) return;
            const fs = key.getState(view.state);
            const root = view.dom;
            if (!fs || !fs.flow) {
              if (storage.pages.length > 0) {
                storage.pages = [];
                storage.listeners.forEach((fn) => fn());
              }
              return;
            }
            const style = getComputedStyle(root);
            const geometry: PageGeometry = {
              contentHeight: cssPx(style, "--sc-content-height"),
              marginTop: cssPx(style, "--sc-margin-top"),
              marginBottom: cssPx(style, "--sc-margin-bottom"),
              sheetGap: SHEET_GAP,
            };
            if (Object.values(geometry).some((v) => Number.isNaN(v))) return;

            const gaps = Array.from(root.querySelectorAll<HTMLElement>(".sc-flow-gap"));
            const tail = root.querySelector<HTMLElement>(".sc-flow-tail");
            if (!tail) return;
            // Read every top first, then write every height: one layout pass.
            const tops = gaps.map((g) => offsetWithin(g, root).top);
            const oldHeights = gaps.map((g) => g.offsetHeight);
            const tailTop = offsetWithin(tail, root).top;

            // Page k's text runs from the end of gap k to the top of gap k+1 (or the tail).
            // Tops were read with the old heights; shift tracks how far each has moved.
            const starts = [geometry.marginTop, ...gaps.map((_, i) => tops[i] + oldHeights[i])];
            const ends = [...tops, tailTop];
            const used = ends.map((end, i) => end - starts[i]);
            const heights = gapHeights(used, geometry);

            let shift = 0;
            const pages: PageBox[] = [];
            const gapPages = gaps.map((g) => Number(g.dataset.page));
            pages.push({ page: 1, startPos: 0, contentTop: starts[0], contentHeight: geometry.contentHeight });
            gaps.forEach((g, i) => {
              g.style.height = `${heights.gaps[i]}px`;
              shift += heights.gaps[i] - oldHeights[i];
              // Every gap is drawn from a page break, so its break is always there; a
              // gap without one (a stale DOM node) names no page start and is left out.
              const start = fs.breaks.find((b) => b.kind === "page" && b.page === gapPages[i]);
              if (!start) return;
              pages.push({
                page: gapPages[i],
                startPos: start.pos,
                contentTop: starts[i + 1] + shift,
                contentHeight: geometry.contentHeight,
              });
            });
            tail.style.height = `${heights.tail}px`;

            storage.pages = pages;
            storage.listeners.forEach((fn) => fn());
          };

          const schedule = () => {
            if (frame === 0) frame = requestAnimationFrame(measure);
          };

          return {
            update(v, prev) {
              const was = key.getState(prev)?.flow;
              const now = key.getState(v.state)?.flow;
              if (now && now !== was) {
                // Resolving needs the DOM, which is current by now; dispatching inside the
                // update would re-enter it, so hand the result over in a microtask.
                queueMicrotask(() => {
                  if (view.isDestroyed || key.getState(view.state)?.flow !== now) return;
                  view.dispatch(
                    view.state.tr.setMeta(key, { breaks: resolveFlow(view, now) }).setMeta("addToHistory", false),
                  );
                });
              }
              schedule();
            },
            destroy() {
              if (frame !== 0) cancelAnimationFrame(frame);
            },
          };
        },
      }),
    ];
  },
});
