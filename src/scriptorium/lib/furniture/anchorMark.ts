/*
 * The anchor mark and the "this page is gone" note (#1176 story 3, canvas frame 15).
 *
 * Imperative DOM like the rest of the editor's furniture layer: elements built
 * for an editor page box, in that box's unscaled px (the 96 dpi page model),
 * which is why px is right here. Styles are in scriptorium-editor.css.
 */

const SVG_NS = "http://www.w3.org/2000/svg";
/** Where the mark sits from the sheet's left edge: inside the page's left margin, clear of the text. */
export const MARK_LEFT_PX = 8;
const MARK_SIZE_PX = 20;

function anchorGlyph(): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  // A ship's anchor: ring, stock, shank and the two flukes.
  for (const d of ["M12 6v15", "M5 12H2a10 10 0 0 0 20 0h-3", "M8 8h8"]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  const ring = document.createElementNS(SVG_NS, "circle");
  ring.setAttribute("cx", "12");
  ring.setAttribute("cy", "4");
  ring.setAttribute("r", "2");
  svg.appendChild(ring);
  return svg;
}

export interface AnchorMarkGeometry {
  /** The anchor block's top, px from the page sheet's top. */
  anchorTop: number;
  /** The picture's drawn left and top, px from the sheet. */
  itemLeft: number;
  itemTop: number;
}

/**
 * The mark in the left margin level with the anchor block's top, and a hairline
 * to the picture: across at the block's level, then along to the picture's top
 * when the two differ. Only the mark takes pointer events.
 */
export function buildAnchorMark(id: string, g: AnchorMarkGeometry): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "sc-anchor-mark-wrap";
  wrap.dataset.anchorWrap = id;

  const startX = MARK_LEFT_PX + MARK_SIZE_PX;
  if (g.itemLeft > startX) {
    const h = document.createElement("div");
    h.className = "sc-anchor-hairline";
    h.style.cssText = `left:${startX}px;top:${g.anchorTop}px;width:${g.itemLeft - startX}px;height:1px`;
    wrap.appendChild(h);
  }
  const dy = g.itemTop - g.anchorTop;
  if (Math.abs(dy) > 1) {
    const v = document.createElement("div");
    v.className = "sc-anchor-hairline";
    v.style.cssText = `left:${Math.max(g.itemLeft, startX)}px;top:${Math.min(g.anchorTop, g.itemTop)}px;width:1px;height:${Math.abs(dy)}px`;
    wrap.appendChild(v);
  }

  const mark = document.createElement("div");
  mark.className = "sc-anchor-mark";
  mark.setAttribute("role", "button");
  mark.setAttribute("aria-label", "Anchor: drag to another paragraph to move the picture with that one");
  mark.title = "Drag onto another paragraph";
  mark.dataset.anchorMark = id;
  mark.style.cssText = `left:${MARK_LEFT_PX}px;top:${g.anchorTop - MARK_SIZE_PX / 2}px;width:${MARK_SIZE_PX}px;height:${MARK_SIZE_PX}px`;
  mark.appendChild(anchorGlyph());
  wrap.appendChild(mark);
  return wrap;
}

/** The note beside a picture whose page the chapter no longer has. */
export function buildGoneNote(pageNumber: number, leftPct: number, topPct: number): HTMLElement {
  const note = document.createElement("div");
  note.className = "sc-gone-note";
  note.textContent = `Page ${pageNumber} is gone; this waits on the last page.`;
  note.style.cssText = `left:${leftPct}%;top:${topPct}%`;
  // Above the picture unless it sits at the very top of the page.
  if (topPct > 4) note.classList.add("sc-gone-note--above");
  return note;
}
