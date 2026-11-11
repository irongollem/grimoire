/*
 * Where the laid-out chapter starts a new page or a new column (#1175).
 *
 * The preview lays the chapter out with Paged.js and measures these from its
 * pages (measureFlow.ts); the editor draws them as page gaps and column breaks
 * (scriptorium/tiptap/pageFlow.ts), so the page being written is the page that prints.
 * A position is named the way both sides can find it: the block's stable id
 * and how many characters of that block's layout text come before it.
 */

/** A point in the chapter's text that both the preview and the editor can find. */
export interface FlowPosition {
  /** The `data-block-id` of the nearest block holding the first character after the break. */
  blockId: string;
  /**
   * Characters of that block's layout text (layoutText.ts) before the break.
   * 0 means the break falls before the block.
   */
  textOffset: number;
}

export interface FlowBreak {
  /** "page": a new page starts here. "column": the second column of the page's last column row starts here. */
  kind: "page" | "column";
  /** 1-based page within the chapter that this break opens (page) or sits on (column). */
  page: number;
  /**
   * Where the break falls. A column break whose second column holds nothing is
   * "page-end": the column ends with the page, and the editor puts the break
   * just before the next page gap (or at the end of the chapter).
   */
  at: FlowPosition | "page-end";
}

export interface ChapterFlow {
  chapterId: string;
  /** Pages the chapter's own text takes. */
  pageCount: number;
  twoColumn: boolean;
  /** In document order: every page break, and in two columns one column break per page. */
  breaks: FlowBreak[];
  /**
   * Classes the preview's preparation (pagedPrepare.ts) gave a block that change
   * its shape on the page, by block id, so the editor gives the same block the
   * same shape: a table set across both columns (`sc-table--span`), the last
   * block of a picture's group, after which the next block starts below the
   * picture (`sc-flow-float-end`).
   */
  layoutClasses: Record<string, string[]>;
}

/** The shape-changing classes `layoutClasses` may name, so the editor applies no others. */
export const FLOW_LAYOUT_CLASSES = ["sc-table--span", "sc-flow-float-end"] as const;
