import { describe, it, expect, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  planPdfChunks,
  PdfPageTooLargeError,
  splitPagesHtml,
  chunkPagesHtml,
  withBusyRetry,
  mergePdfs,
  pdfProgressLabel,
  PDF_CHUNK_BUDGET_BYTES,
} from "./pdfChunks";

describe("planPdfChunks", () => {
  it("keeps one page in one chunk", () => {
    expect(planPdfChunks([100], 50, 1000)).toEqual([{ start: 0, end: 1 }]);
  });

  it("returns nothing for no pages", () => {
    expect(planPdfChunks([], 50, 1000)).toEqual([]);
  });

  it("keeps a book that exactly fits in one chunk", () => {
    expect(planPdfChunks([400, 450], 150, 1000)).toEqual([{ start: 0, end: 2 }]);
  });

  it("splits when one byte over, in consecutive ranges covering every page", () => {
    expect(planPdfChunks([400, 451], 150, 1000)).toEqual([
      { start: 0, end: 1 },
      { start: 1, end: 2 },
    ]);
  });

  it("repeats the overhead for every chunk", () => {
    // overhead 100, budget 1000: 300+300+300 fills chunk one exactly.
    expect(planPdfChunks([300, 300, 300, 300, 300, 300, 300], 100, 1000)).toEqual([
      { start: 0, end: 3 },
      { start: 3, end: 6 },
      { start: 6, end: 7 },
    ]);
  });

  it("names a page that cannot fit even alone (1-based)", () => {
    expect(() => planPdfChunks([100, 950, 100], 100, 1000)).toThrow(PdfPageTooLargeError);
    expect(() => planPdfChunks([100, 950, 100], 100, 1000)).toThrow(/Page 2 /);
  });

  it("accepts a page that fits alone exactly", () => {
    expect(planPdfChunks([900], 100, 1000)).toEqual([{ start: 0, end: 1 }]);
  });

  it("defaults to a 32 MB budget", () => {
    expect(PDF_CHUNK_BUDGET_BYTES).toBe(32 * 1024 * 1024);
  });
});

describe("splitPagesHtml", () => {
  const p = (n: number) => `<div class="pagedjs_page">${n}</div>`;
  const full = `<div class="pagedjs_pages" style="--x:1">${p(1)}\n${p(2)}${p(3)}</div>`;
  const pages = [p(1), p(2), p(3)];

  it("reassembles exactly", () => {
    const s = splitPagesHtml(full, pages);
    expect(s.prefix + s.segments.join("") + s.suffix).toBe(full);
    expect(s.prefix).toBe('<div class="pagedjs_pages" style="--x:1">');
    expect(s.suffix).toBe("</div>");
  });

  it("builds a chunk with the same wrapper and only its pages", () => {
    const s = splitPagesHtml(full, pages);
    const html = chunkPagesHtml(s, { start: 1, end: 3 });
    expect(html.startsWith(s.prefix)).toBe(true);
    expect(html.endsWith("</div>")).toBe(true);
    expect(html).toContain(">2<");
    expect(html).toContain(">3<");
    expect(html).not.toContain(">1<");
  });

  it("throws when a page is not in the markup", () => {
    expect(() => splitPagesHtml("<div></div>", [p(1)])).toThrow();
  });
});

describe("withBusyRetry", () => {
  it("retries a busy printer after waiting, then succeeds", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("The PDF printer is busy. Try again in a few seconds."))
      .mockResolvedValueOnce("ok");
    await expect(withBusyRetry(attempt, { sleep, waitMs: 5 })).resolves.toBe("ok");
    expect(sleep).toHaveBeenCalledWith(5);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("gives up after the bounded retries", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const attempt = vi.fn().mockRejectedValue(new Error("The PDF printer is busy."));
    await expect(withBusyRetry(attempt, { sleep, retries: 2 })).rejects.toThrow(/busy/);
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("does not retry other failures (daily limit, hourly limit)", async () => {
    const sleep = vi.fn();
    const attempt = vi.fn().mockRejectedValue(new Error("PDF export has reached today's limit."));
    await expect(withBusyRetry(attempt, { sleep })).rejects.toThrow(/today's limit/);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});

describe("mergePdfs", () => {
  async function pdfWithPages(sizes: number[]): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (const w of sizes) doc.addPage([w, 200]);
    return doc.save();
  }

  it("keeps every page, in order", async () => {
    const merged = await mergePdfs([await pdfWithPages([100, 110]), await pdfWithPages([120])]);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPages().map((pg) => pg.getWidth())).toEqual([100, 110, 120]);
  });
});

describe("pdfProgressLabel", () => {
  it("names the part only for a multi-part book", () => {
    expect(pdfProgressLabel(null)).toBe("Building…");
    expect(pdfProgressLabel({ part: 1, total: 1 })).toBe("Building…");
    expect(pdfProgressLabel({ part: 2, total: 4 })).toBe("Building part 2 of 4…");
  });
});
