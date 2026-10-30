/**
 * The one registry of Scriptorium looks (#1115): the two book editions and the
 * four handout papers. A document's `theme` is one of these ids; everything
 * that needs to know what a theme is called, which CSS class it paints under,
 * which stylesheet the PDF export must inline, or what a new handout on that
 * paper starts with, asks here instead of branching on theme strings.
 */
import type {
  ScriptoriumBookTheme,
  ScriptoriumPaper,
  ScriptoriumTheme,
} from "@/types/scriptorium.types";
import type { NoticePinStyle } from "@/types/noticeBoard.types";
import onednd2024Css from "@/assets/scriptorium/theme-onednd2024.css?inline";
import phb2014Css from "@/assets/scriptorium/theme-phb2014.css?inline";
import letterCss from "@/assets/scriptorium/theme-letter.css?inline";
import noticeCss from "@/assets/scriptorium/theme-notice.css?inline";
import journalCss from "@/assets/scriptorium/theme-journal.css?inline";
import plainCss from "@/assets/scriptorium/theme-plain.css?inline";

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
  onednd2024: { id: "onednd2024", label: "2024 book", family: "book", className: "theme-onednd2024", css: onednd2024Css },
  phb2014: { id: "phb2014", label: "2014 book", family: "book", className: "theme-phb2014", css: phb2014Css },
  letter: { id: "letter", label: "Letter", family: "paper", className: "theme-letter", css: letterCss },
  notice: { id: "notice", label: "Notice", family: "paper", className: "theme-notice", css: noticeCss },
  journal: { id: "journal", label: "Journal page", family: "paper", className: "theme-journal", css: journalCss },
  plain: { id: "plain", label: "Plain page", family: "paper", className: "theme-plain", css: plainCss },
};

/** The handout papers, in the order "What is it written on?" shows them. */
export const PAPERS: readonly ScriptoriumPaper[] = ["letter", "notice", "journal", "plain"];

export const BOOK_LOOKS: readonly ScriptoriumBookTheme[] = ["onednd2024", "phb2014"];

export function scriptoriumLook(theme: ScriptoriumTheme): ScriptoriumLook {
  return LOOKS[theme];
}

export function scriptoriumThemeClass(theme: ScriptoriumTheme): string {
  return LOOKS[theme].className;
}

export function scriptoriumThemeCss(theme: ScriptoriumTheme): string {
  return LOOKS[theme].css;
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
