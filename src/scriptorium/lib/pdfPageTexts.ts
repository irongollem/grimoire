/*
 * The text of every page of a PDF, read with pdf.js (#1176). Feeds
 * printCheck.ts, which compares it with what the laid-out pages said.
 *
 * pdf.js is large and only an export needs it, so the browser path imports it
 * (and its worker, as a URL the way Vite wants) when a check runs, never at
 * boot. `readPageTexts` takes the module as an argument so the print test in
 * CI can hand it Node's build instead of the browser one.
 */
import type * as PdfJs from "pdfjs-dist";

/** One string per page, in page order: the page's text items joined by spaces. */
export async function readPageTexts(pdfjs: Pick<typeof PdfJs, "getDocument">, bytes: Uint8Array): Promise<string[]> {
  // pdf.js takes ownership of the buffer it is given, so it gets a copy.
  const task = pdfjs.getDocument({ data: bytes.slice() });
  const doc = await task.promise;
  try {
    const texts: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      texts.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
      page.cleanup();
    }
    return texts;
  } finally {
    await task.destroy();
  }
}

/**
 * pdf.js calls `Promise.withResolvers` (Safari 17.4) in its page code and in
 * its worker. A polyfill on the page cannot reach the worker, so an engine
 * without it never loads pdf.js: the read refuses and the print check reports
 * itself unavailable, while the export itself is untouched.
 */
export function canReadPdf(promise: PromiseConstructor = Promise): boolean {
  return typeof (promise as unknown as Record<string, unknown>).withResolvers === "function";
}

/** Browser: loads pdf.js on first use and reads the PDF's pages. */
export async function readPdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  if (!canReadPdf()) throw new Error("This browser cannot read PDFs back (no Promise.withResolvers).");
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return readPageTexts(pdfjs, bytes);
}
