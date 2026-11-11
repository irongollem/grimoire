/*
 * Reading an export back (#1176, "the PDF is the page").
 *
 * Chrome lays a page out again when it prints it, so a block that ended within
 * a pixel of the page bottom can fall off the page and vanish (#1115). The
 * pages the editor drew are the truth; this compares what each one SAID with
 * what the PDF's page says, and names the pages that differ.
 *
 * Pure on purpose: the caller reads the laid-out pages' text out of the DOM
 * (`expectedPagesFromDom`) and the PDF's text out of pdf.js (pdfPageTexts.ts),
 * and this module only compares, so every rule tests without a browser.
 *
 * What counts as "the same text": letters and digits only, lower-cased, with
 * ligatures split (NFKC). Spaces, hyphens, soft hyphens and line breaks are
 * all dropped, so a word Chrome hyphenated differently, or a pdf.js text item
 * boundary, can never be a mismatch. A page passes when its first and its
 * last few words are somewhere on the printed page and the amount of text on
 * it is about what was laid out (a page that lost a block is shorter, one
 * that took in another's lines is longer). Order is never compared: pdf.js
 * reads boxes and floats in paint order, which the DM never sees.
 */

/** How many words at each end of a page's text are compared. */
export const EDGE_WORDS = 4;

/** What one laid-out page said. */
export interface ExpectedPage {
  /** 0-based position among all the book's pages, blanks included. */
  index: number;
  /** The printed page number; null for a cover, a skipped page or a blank. */
  label: string | null;
  /** The text of the page's own content. Furniture and footers are not in it. */
  text: string;
  /**
   * Text the page prints that is known and not the content: the footer, its
   * page numbers, furniture, margin boxes. Allowed to appear anywhere on the
   * printed page without being a mismatch.
   */
  ignorable: string[];
}

export type PrintMismatchReason =
  | "starts with different words"
  | "ends with different words"
  | "has text the page did not"
  | "is missing text the page had"
  | "page missing"
  | "extra page";

export interface PrintMismatch {
  /** 0-based position among the pages that were sent (for an extra page: its place in the PDF). */
  index: number;
  /** What the DM sees: "Page 14", or "Page 3 of the file" for a page with no printed number. */
  label: string;
  reason: PrintMismatchReason;
}

export type PrintCheckResult = { ok: true } | { ok: false; pages: PrintMismatch[] };

/** Letters and digits only, ligatures split, lower case: what two texts are compared on. */
export function compactText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function wordsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map(compactText)
    .filter((w) => w.length > 0);
}

function pageLabel(page: Pick<ExpectedPage, "index" | "label">): string {
  return page.label !== null ? `Page ${page.label}` : `Page ${page.index + 1} of the file`;
}

/** `printed` with every known fragment taken out once; what is left is the page's own text as printed. */
function withoutFurniture(printed: string, ignorable: string[]): string {
  let rest = printed;
  for (const fragment of ignorable) {
    const compact = compactText(fragment);
    if (compact.length === 0) continue;
    rest = rest.replace(compact, "");
  }
  return rest;
}

/**
 * How many letters a page's printed text may differ from what was laid out
 * before it counts. The printer writes a few characters the text never had
 * (list numbers, quote marks a style adds), and none of them is a lost line.
 */
function lengthTolerance(expectedLength: number): number {
  return Math.max(10, Math.ceil(expectedLength * 0.01));
}

function checkPage(expected: ExpectedPage, printedText: string): PrintMismatchReason | null {
  const printed = compactText(printedText);
  const words = wordsOf(expected.text);
  const expectedLength = words.join("").length;
  const printedLength = withoutFurniture(printed, expected.ignorable).length;

  if (words.length > 0) {
    // Found anywhere on the page, not in order: pdf.js reads a box or a float
    // in the order Chrome painted it, which is not always the order it was
    // written, and the DM sees no difference.
    if (!printed.includes(words.slice(0, EDGE_WORDS).join(""))) return "starts with different words";
    if (!printed.includes(words.slice(-EDGE_WORDS).join(""))) return "ends with different words";
  }
  const tolerance = lengthTolerance(expectedLength);
  if (printedLength - expectedLength > tolerance) return "has text the page did not";
  if (expectedLength - printedLength > tolerance) return "is missing text the page had";
  return null;
}

/**
 * Compares the pages that were sent with the pages that came back. Page counts
 * first (a page missing or an extra page shifts everything after it), then
 * each page's first and last words, then text on a page that the layout did
 * not put there.
 */
export function checkPrintedPages(expected: ExpectedPage[], printed: string[]): PrintCheckResult {
  const found: PrintMismatch[] = [];

  expected.forEach((page, i) => {
    if (i >= printed.length) {
      found.push({ index: page.index, label: pageLabel(page), reason: "page missing" });
      return;
    }
    const reason = checkPage(page, printed[i]);
    if (reason) found.push({ index: page.index, label: pageLabel(page), reason });
  });
  for (let i = expected.length; i < printed.length; i++) {
    found.push({ index: i, label: `Page ${i + 1} of the file`, reason: "extra page" });
  }

  return found.length === 0 ? { ok: true } : { ok: false, pages: found };
}
