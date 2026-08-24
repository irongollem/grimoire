/**
 * Page counting for the document importer's (#353) upload step — turns a raw
 * file selection into the page count `validateUpload` (limits.ts) needs to
 * enforce the free/Pro cap, before anything is uploaded or sent to the
 * extractor.
 *
 * Two functions, two jobs:
 *
 *   - `countPdfPages` is the pdf-lib primitive: bytes in, page count out.
 *   - `countPages` is what the upload UI actually calls: it classifies the
 *     file selection (one PDF vs. a batch of photos), rejects the shapes
 *     `document_imports` cannot represent, and never lets a raw exception
 *     reach the caller — every outcome, success or failure, comes back as
 *     data.
 *
 * ── Why `countPdfPages` throws but `countPages` never does ──────────────────
 *
 * `countPdfPages` still throws on a bad PDF — its signature is `Promise<number>`
 * because a page count with no failure case bolted on is what the rest of this
 * module (and any other pdf-lib caller) actually wants to compose with. What it
 * must not do is let pdf-lib's own exception — whatever shape that library
 * happens to throw this version, for a truncated file, a missing xref, a
 * checksum mismatch — reach a caller that has no reason to know pdf-lib exists.
 * So a parse failure is re-thrown as `PdfReadError`, a stable, typed shape with
 * a DM-readable message. `countPages`, the wizard's actual entry point, then
 * catches that (and only that) and folds it into the discriminated result every
 * other outcome already uses, matching `UploadValidationResult` in limits.ts.
 *
 * ── Why a corrupt PDF and an encrypted one share one failure reason ──────────
 *
 * `PDFDocument.load` is called with `ignoreEncryption: true`, so a merely
 * password-protected PDF loads fine — its page tree is ordinarily untouched by
 * the encryption filter — and only genuinely unparseable bytes throw. There is
 * therefore nothing left to distinguish "encrypted" from "corrupt" by the time
 * this code sees a failure; both are the same `unreadable` outcome, and the
 * pdf-lib message is passed through rather than paraphrased into a guess.
 *
 * ── Why a mixed selection and multiple PDFs are rejected here, not later ────
 *
 * `document_imports.source_kind` is a single `'pdf' | 'images'` column and
 * `source_paths` is page-ordered within *one* document (documentImport.types.ts).
 * A PDF alongside loose photos, or two PDFs at once, has no row shape to land
 * in — better to say so at the file picker than to accept the upload and fail
 * unpredictably deeper in the pipeline.
 */
import { PDFDocument } from "pdf-lib";

// ── countPdfPages ────────────────────────────────────────────────────────────

/**
 * Typed replacement for whatever `PDFDocument.load` throws on unparseable
 * bytes, so a caller can catch one stable class instead of an arbitrary
 * pdf-lib exception. See the file header for why this is the only failure
 * mode `countPdfPages` can produce.
 */
export class PdfReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PdfReadError";
  }
}

/** Page count of a single PDF's raw bytes. Throws `PdfReadError` on unparseable input. */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (cause) {
    throw new PdfReadError(
      "That PDF couldn't be read. It may be corrupted, or in a format pdf-lib doesn't support.",
      { cause },
    );
  }
  return doc.getPageCount();
}

// ── countPages ───────────────────────────────────────────────────────────────

export const PAGE_COUNT_FAILURE_REASONS = [
  "empty_selection",
  "mixed_selection",
  "multiple_pdfs",
  "unreadable",
] as const;

export type PageCountFailureReason = (typeof PAGE_COUNT_FAILURE_REASONS)[number];

/**
 * Mirrors `UploadValidationResult` in limits.ts: `ok: true` carries what a
 * successful count actually looked like (a single PDF's page count, or a
 * photo batch's file count) rather than just a number, because the wizard's
 * next step needs to know which `source_kind` it is building toward.
 */
export type PageCountResult =
  | { ok: true; kind: "pdf"; pageCount: number }
  | { ok: true; kind: "images"; pageCount: number }
  | { ok: false; reason: PageCountFailureReason; message: string };

/**
 * The upload UI's entry point. One PDF's page count is its own page count; a
 * batch of photos counts one page per photo, since each image *is* a page for
 * this purpose (there is no separate "page" concept inside a JPEG).
 *
 * Every rejection here is a shape `document_imports` cannot represent (see the
 * file header), not a size or quota judgement — those stay in `validateUpload`,
 * which runs after this on whichever `pageCount` comes back.
 */
export async function countPages(files: readonly File[]): Promise<PageCountResult> {
  if (files.length === 0) {
    return {
      ok: false,
      reason: "empty_selection",
      message: "Select a PDF or at least one photo to import.",
    };
  }

  const pdfFiles = files.filter((file) => file.type === "application/pdf");
  const otherFiles = files.filter((file) => file.type !== "application/pdf");

  if (pdfFiles.length > 0 && otherFiles.length > 0) {
    return {
      ok: false,
      reason: "mixed_selection",
      message: "Choose either one PDF or a batch of photos — a single import can't be both.",
    };
  }

  if (pdfFiles.length > 1) {
    return {
      ok: false,
      reason: "multiple_pdfs",
      message: "Only one PDF can be imported at a time. Select a single document.",
    };
  }

  if (pdfFiles.length === 1) {
    const [pdfFile] = pdfFiles;
    const bytes = new Uint8Array(await pdfFile.arrayBuffer());
    try {
      const pageCount = await countPdfPages(bytes);
      return { ok: true, kind: "pdf", pageCount };
    } catch (error) {
      const message = error instanceof PdfReadError ? error.message : "That PDF couldn't be read.";
      return { ok: false, reason: "unreadable", message };
    }
  }

  return { ok: true, kind: "images", pageCount: otherFiles.length };
}
