/**
 * The one registry of Scriptorium looks (#1115): the three book looks (Grimoire,
 * the 2024 edition, the 2014 edition) and the four handout papers. A document's
 * `theme` is one of these ids; everything that needs to know what a theme is called, which CSS class it paints under,
 * which stylesheet the PDF export must inline, or what a new handout on that
 * paper starts with, asks here instead of branching on theme strings.
 */
import type {
  ScriptoriumBookTheme,
  ScriptoriumFooterStyle,
  ScriptoriumPaper,
  ScriptoriumTheme,
} from "@/scriptorium/types";
import { artUrl } from "@/lib/assets/artUrl";
import { paperById, type PaperId } from "@/scriptorium/papers/papers";
import type { NoticePinStyle } from "@/types/noticeBoard.types";
import grimoireCss from "@/scriptorium/styles/theme-grimoire.css?inline";
import onednd2024Css from "@/scriptorium/styles/theme-onednd2024.css?inline";
import phb2014Css from "@/scriptorium/styles/theme-phb2014.css?inline";
import letterCss from "@/scriptorium/styles/theme-letter.css?inline";
import noticeCss from "@/scriptorium/styles/theme-notice.css?inline";
import journalCss from "@/scriptorium/styles/theme-journal.css?inline";
import plainCss from "@/scriptorium/styles/theme-plain.css?inline";

export interface ScriptoriumLook {
  id: ScriptoriumTheme;
  label: string;
  /** "book" looks are for chapters and columns, "paper" looks for handouts. */
  family: "book" | "paper";
  /** The class on the `.sc-theme` element. */
  className: string;
  /** The look's stylesheet as text, for the PDF export to inline. */
  css: string;
}

const LOOKS: Record<ScriptoriumTheme, ScriptoriumLook> = {
  grimoire: { id: "grimoire", label: "Grimoire", family: "book", className: "theme-grimoire", css: grimoireCss },
  onednd2024: { id: "onednd2024", label: "2024 book", family: "book", className: "theme-onednd2024", css: onednd2024Css },
  phb2014: { id: "phb2014", label: "2014 book", family: "book", className: "theme-phb2014", css: phb2014Css },
  letter: { id: "letter", label: "Letter", family: "paper", className: "theme-letter", css: letterCss },
  notice: { id: "notice", label: "Notice", family: "paper", className: "theme-notice", css: noticeCss },
  journal: { id: "journal", label: "Journal page", family: "paper", className: "theme-journal", css: journalCss },
  plain: { id: "plain", label: "Plain page", family: "paper", className: "theme-plain", css: plainCss },
};

/** The handout papers, in the order "What is it written on?" shows them. */
export const PAPERS: readonly ScriptoriumPaper[] = ["letter", "notice", "journal", "plain"];

export const FOOTER_STYLE_CHOICES: readonly { value: ScriptoriumFooterStyle; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "ribbon", label: "Ribbon" },
];

export const BOOK_LOOKS: readonly ScriptoriumBookTheme[] = ["grimoire", "onednd2024", "phb2014"];

export function scriptoriumLook(theme: ScriptoriumTheme): ScriptoriumLook {
  return LOOKS[theme];
}

export function scriptoriumThemeClass(theme: ScriptoriumTheme): string {
  return LOOKS[theme].className;
}

export function scriptoriumThemeCss(theme: ScriptoriumTheme): string {
  return LOOKS[theme].css;
}

/** Both finishes that make a page print plain white and so leave a paper off. */
function paperApplies(opts: { paperTone?: PaperId | null; inkFriendly?: boolean }): opts is { paperTone: PaperId; inkFriendly?: boolean } {
  return Boolean(opts.paperTone) && !opts.inkFriendly;
}

/**
 * Every class a renderer puts on its `.sc-theme` element: the look's own, the
 * document's paper and the ribbon footer. One function so no renderer can
 * forget one. A book or a handout may carry a paper (it replaces the look's
 * own page background); ink-friendly prints plain white whatever the paper.
 * The paper's picture comes with it as `bookSurfaceStyle`, bound beside this.
 */
export function bookSurfaceClasses(opts: {
  theme: ScriptoriumTheme;
  paperTone?: PaperId | null;
  footerStyle?: ScriptoriumFooterStyle | null;
  inkFriendly?: boolean;
}): string[] {
  const classes = [LOOKS[opts.theme].className];
  if (paperApplies(opts)) classes.push("sc-paper");
  if (opts.footerStyle === "ribbon") classes.push("sc-footer-style--ribbon");
  return classes;
}

/**
 * The inline custom properties the `.sc-paper` rule paints from. Papers are served from the art CDN, which a
 * stylesheet cannot name, so the URL is set here. The tile is sized in millimetres, not pixels: a painted full
 * page is 2480 px across an A4 sheet, so 1024 px of surface x `surfaceScale` is about 86.7 mm x `surfaceScale`
 * of paper, and a page is laid out at real CSS size (the 96 dpi page model; the preview scales it with a
 * transform, which scales the tile with it). The paper's features are then as large on a page as in a painting.
 */
export function paperSurfaceStyle(paperId: PaperId): Record<string, string> {
  const paper = paperById(paperId);
  const tile = `${((1024 * paper.surfaceScale * 210) / 2480).toFixed(2)}mm`;
  return {
    "--sc-paper-image": `url(${artUrl(paper.surfacePath)})`,
    "--sc-paper-veil": `rgb(255 255 255 / ${paper.veil})`,
    "--sc-paper-size": `${tile} ${tile}`,
    "--sc-page-bg": paper.tint,
  };
}

/** The inline style that goes with `bookSurfaceClasses`: empty when no paper applies. */
export function bookSurfaceStyle(opts: { paperTone?: PaperId | null; inkFriendly?: boolean }): Record<string, string> {
  return paperApplies(opts) ? paperSurfaceStyle(opts.paperTone) : {};
}

/** What a new handout on this paper starts with: one A5 column, no furniture. */
export function handoutDefaults(_paper: ScriptoriumPaper): {
  page_size: "A5";
  is_two_column: false;
  show_page_numbers: false;
  footer_text: "";
} {
  return { page_size: "A5", is_two_column: false, show_page_numbers: false, footer_text: "" };
}

/** The notice board pin a handout on this paper becomes when pinned. */
export function noticePinStyleForPaper(paper: ScriptoriumPaper): NoticePinStyle {
  switch (paper) {
    case "letter":
      return "letter";
    case "notice":
      return "poster";
    case "journal":
    case "plain":
      return "note";
  }
}
