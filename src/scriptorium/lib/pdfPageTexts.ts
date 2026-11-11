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

/** Browser: loads pdf.js on first use and reads the PDF's pages. */
export async function readPdfPageTexts(bytes: Uint8Array): Promise<string[]> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return readPageTexts(pdfjs, bytes);
}
