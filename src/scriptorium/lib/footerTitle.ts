/*
 * The running title in a page's footer (#1176 story 6, frame 10): the book's
 * on a left-hand page and, as a printed book does, the chapter's on a
 * right-hand one. The book's footer text is the "custom" choice for the right.
 */
import type { InjectionKey } from "vue";
import type { ScriptoriumFooterStyle, ScriptoriumFooterTitle } from "@/scriptorium/types";

export interface FooterTitleSource {
  mode: ScriptoriumFooterTitle;
  bookTitle: string;
  chapterTitle: string;
  /** The book's footer text. */
  custom: string;
}

/** What the footer says on one page. */
export function runningTitle(source: FooterTitleSource, recto: boolean): string {
  if (!recto) return source.bookTitle;
  switch (source.mode) {
    case "chapter":
      return source.chapterTitle;
    case "book":
      return source.bookTitle;
    case "custom":
      return source.custom;
  }
}

/** A new book that comes with footer text (a template, a write-up) prints it; any other carries its chapters' titles. */
export function footerTitleFor(footerText: string): ScriptoriumFooterTitle {
  return footerText.trim() === "" ? "chapter" : "custom";
}

/** A chapter's title is the text of its first heading, as the client writes it on save. */
export function chapterTitleOf(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const heading = doc.querySelector("h1");
  return heading?.textContent?.trim() ?? "";
}

/** The footer choices a book keeps, as the panel reads and writes them. */
export interface FooterChoices {
  showPageNumbers: boolean;
  pageNumberStart: number;
  footerText: string;
  footerTitle: ScriptoriumFooterTitle;
  footerStyle: ScriptoriumFooterStyle;
}

/**
 * The book's footer choices, provided by the book editor to the panel so a
 * footer clicked on the page edits the same settings as Book settings.
 */
export interface FooterSettingsAccess {
  draft: FooterChoices;
  patch: (values: Partial<FooterChoices>) => void;
}

export const FOOTER_SETTINGS_KEY: InjectionKey<FooterSettingsAccess> = Symbol("scriptorium-footer-settings");
