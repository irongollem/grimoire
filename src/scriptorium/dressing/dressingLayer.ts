/*
 * The element a page's dressing is drawn with (#1181), shared by every place a page is drawn: the paged preview and
 * the PDF (renderFurniture), the chapter editor's pages (EditorFurnitureLayer), the player's reader and the
 * document view. One function turns `dressPage`'s marks into elements, so no renderer places a mark of its own.
 *
 * Each mark is a box filled with the look's ink and cut to the painted shape by a mask, so one mark takes any
 * ink. The layer sits behind the text, takes no pointer events and clips what bleeds past the page edge.
 *
 * The mask pictures are named once, in a stylesheet (`dressingCss`), not on every mark: a book can run to hundreds
 * of pages, and the PDF carries each picture inside its HTML as a data: URI, which a per-mark URL would repeat on
 * every page (some 700 KB a page). The stylesheet is added to the document once for the screen, and travels once
 * in the PDF's head (printDocument.ts), where the asset inliner turns its URLs into data.
 */
import { artUrl } from "@/lib/assets/artUrl";
import {
  dressPage,
  MARK_ASSETS,
  type DressPageOptions,
  type Dressing,
  type Mark,
  type MarkAsset,
  type PageKind,
} from "@/scriptorium/dressing/dressing";

export const DRESSING_CLASS = "sc-dressing";
const STYLE_ID = "sc-dressing-style";

const pct = (n: number): string => `${Number(n.toFixed(3))}%`;

/**
 * The rules every mark shares and each mark's mask picture. A mark is the look's ink (`--sc-ink`) seen through its
 * picture, so it keeps its colour whatever the paper. The picture URLs go through `artUrl`: the CDN in production.
 */
export function dressingCss(): string {
  const masks = (Object.keys(MARK_ASSETS) as MarkAsset[])
    .map((asset) => {
      const url = `url(${artUrl(MARK_ASSETS[asset].path)})`;
      return `.${DRESSING_CLASS} > [data-mark="${asset}"]{-webkit-mask-image:${url};mask-image:${url}}`;
    })
    .join("\n");
  return (
    `.${DRESSING_CLASS}{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}\n` +
    `.${DRESSING_CLASS} > [data-mark]{position:absolute;background-color:var(--sc-ink,#2a2018);` +
    `-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}\n` +
    masks
  );
}

/** Puts the dressing stylesheet in the document, once. */
function ensureDressingStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = dressingCss();
  document.head.appendChild(style);
}

/** The inline style of one mark: where it sits, how it is turned and how strong it is. */
export function markStyle(mark: Mark): string {
  const turn = [
    mark.rotate !== 0 ? `rotate(${Number(mark.rotate.toFixed(2))}deg)` : "",
    mark.flipX || mark.flipY ? `scale(${mark.flipX ? -1 : 1},${mark.flipY ? -1 : 1})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return [
    `left:${pct(mark.left)}`,
    `top:${pct(mark.top)}`,
    `width:${pct(mark.width)}`,
    `height:${pct(mark.height)}`,
    ...(turn ? [`transform:${turn}`] : []),
    `opacity:${Number(mark.opacity.toFixed(3))}`,
  ].join(";");
}

/** The layer holding this page's marks, or null when it carries none (no dressing, a cover, a blank page). */
export function buildDressingLayer(
  dressing: Dressing | null,
  pageNumber: number,
  kind: PageKind,
  opts: DressPageOptions = {},
): HTMLElement | null {
  const marks = dressPage(dressing, pageNumber, kind, opts);
  if (marks.length === 0) return null;
  ensureDressingStyle();
  const layer = document.createElement("div");
  layer.className = DRESSING_CLASS;
  layer.setAttribute("aria-hidden", "true");
  for (const mark of marks) {
    const el = document.createElement("div");
    el.dataset.mark = mark.asset;
    el.setAttribute("style", markStyle(mark));
    layer.appendChild(el);
  }
  return layer;
}
