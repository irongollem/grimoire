/*
 * The one source of page geometry for the Scriptorium: the print margins, the
 * slack Paged.js fits text short by, the column gap, and what they make of a
 * page size. The preview's `@page` rule, the editor's sheet and the layout
 * code all read these numbers, so the page the DM writes on and the page the
 * book prints cannot drift apart. px is intentional: this is the 96 dpi page
 * model of EDITOR_PAGE_DIMENSIONS_PX, not UI sizing.
 */

import { EDITOR_PAGE_DIMENSIONS_PX } from "@/scriptorium/lib/editorConstants";
import type { ScriptoriumPageSize } from "@/scriptorium/types";

/** The `@page` margins, in px. Every page size uses the same ones. */
export const PAGE_MARGINS_PX = { top: 56, right: 68, bottom: 53, left: 68 } as const;

/**
 * How much shorter than the printed page Paged.js lays each page out. The
 * book is paginated in the user's browser and printed by render-pdf's Chrome
 * on another machine, which lays every page's text out again. A block that
 * ends within a pixel of the page bottom and comes out a fraction taller
 * there falls into the page's off-page column and is not printed (#1115).
 * The printed page gets this room back, so a page always has a little more
 * height in print than its text was fitted to.
 */
export const PRINT_SLACK_PX = 6;

/**
 * The `.phb-two-col` column gap (1.5rem, theme-base.css) at the 16px root the
 * app never changes. px because the geometry here is page pixels.
 */
export const COLUMN_GAP_PX = 24;

export interface PageGeometry {
  width: number;
  height: number;
  margins: typeof PAGE_MARGINS_PX;
  /** Page width minus the side margins: the text measure of a single column. */
  contentWidth: number;
  /** Page height minus the top and bottom margins. */
  contentHeight: number;
  /** contentHeight less PRINT_SLACK_PX: what Paged.js fits text into. */
  fittedContentHeight: number;
  /** One column's width: the whole measure, or half of it less the gap. */
  columnWidth: number;
}

export function pageGeometry(pageSize: ScriptoriumPageSize, twoColumn: boolean): PageGeometry {
  const { w, h } = EDITOR_PAGE_DIMENSIONS_PX[pageSize];
  const contentWidth = w - PAGE_MARGINS_PX.left - PAGE_MARGINS_PX.right;
  const contentHeight = h - PAGE_MARGINS_PX.top - PAGE_MARGINS_PX.bottom;
  return {
    width: w,
    height: h,
    margins: PAGE_MARGINS_PX,
    contentWidth,
    contentHeight,
    fittedContentHeight: contentHeight - PRINT_SLACK_PX,
    columnWidth: twoColumn ? (contentWidth - COLUMN_GAP_PX) / 2 : contentWidth,
  };
}

/** The geometry as CSS custom properties, for the editor sheet and later layout code. */
export function pageGeometryCssVars(g: PageGeometry): Record<string, string> {
  return {
    "--sc-page-width": `${g.width}px`,
    "--sc-page-height": `${g.height}px`,
    "--sc-margin-top": `${g.margins.top}px`,
    "--sc-margin-right": `${g.margins.right}px`,
    "--sc-margin-bottom": `${g.margins.bottom}px`,
    "--sc-margin-left": `${g.margins.left}px`,
    "--sc-content-height": `${g.fittedContentHeight}px`,
    "--sc-column-width": `${g.columnWidth}px`,
    "--sc-column-gap": `${COLUMN_GAP_PX}px`,
  };
}
