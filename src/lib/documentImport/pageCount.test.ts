import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PdfReadError, countPages, countPdfPages } from "./pageCount";

async function buildPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([300, 400]);
  }
  return doc.save();
}

function pdfFile(bytes: Uint8Array, name = "document.pdf"): File {
  // pdf-lib's `save()` returns a `Uint8Array<ArrayBufferLike>` — its backing
  // buffer could in principle be a `SharedArrayBuffer`, which `BlobPart`
  // doesn't accept. Re-wrapping copies the bytes into a fresh, plain
  // `ArrayBuffer`-backed view.
  return new File([new Uint8Array(bytes)], name, { type: "application/pdf" });
}

function imageFile(name: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

describe("countPdfPages", () => {
  it("counts the pages of a generated PDF", async () => {
    const bytes = await buildPdf(4);
    await expect(countPdfPages(bytes)).resolves.toBe(4);
  });

  it("counts a single-page PDF", async () => {
    const bytes = await buildPdf(1);
    await expect(countPdfPages(bytes)).resolves.toBe(1);
  });

  it("rejects corrupt bytes with a typed PdfReadError, not a raw throw", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    await expect(countPdfPages(garbage)).rejects.toBeInstanceOf(PdfReadError);
  });

  it("gives PdfReadError a DM-readable message, not the raw pdf-lib error shape", async () => {
    const garbage = new Uint8Array([0, 0, 0, 0]);
    try {
      await countPdfPages(garbage);
      expect.unreachable("expected countPdfPages to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PdfReadError);
      expect(typeof (error as PdfReadError).message).toBe("string");
      expect((error as PdfReadError).message.length).toBeGreaterThan(0);
    }
  });
});

describe("countPages — PDF selection", () => {
  it("returns the page count for a single valid PDF", async () => {
    const result = await countPages([pdfFile(await buildPdf(7))]);
    expect(result).toEqual({ ok: true, kind: "pdf", pageCount: 7 });
  });

  it("reports an unreadable PDF as a typed failure, not a throw", async () => {
    const corrupt = new File([new Uint8Array([9, 9, 9, 9])], "bad.pdf", { type: "application/pdf" });
    const result = await countPages([corrupt]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("unreadable");
      expect(result.message.length).toBeGreaterThan(0);
    }
  });
});

describe("countPages — image selection", () => {
  it("counts N images as N pages", async () => {
    const files = [imageFile("a.jpg"), imageFile("b.jpg"), imageFile("c.jpg")];
    const result = await countPages(files);
    expect(result).toEqual({ ok: true, kind: "images", pageCount: 3 });
  });

  it("counts a single image as one page", async () => {
    const result = await countPages([imageFile("solo.jpg")]);
    expect(result).toEqual({ ok: true, kind: "images", pageCount: 1 });
  });
});

describe("countPages — rejects shapes document_imports can't represent", () => {
  it("rejects a PDF mixed with photos", async () => {
    const files = [pdfFile(await buildPdf(2)), imageFile("a.jpg")];
    const result = await countPages(files);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("mixed_selection");
    }
  });

  it("rejects photos mixed with a PDF regardless of order", async () => {
    const files = [imageFile("a.jpg"), imageFile("b.jpg"), pdfFile(await buildPdf(2))];
    const result = await countPages(files);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("mixed_selection");
    }
  });

  it("rejects multiple PDFs in one selection", async () => {
    const files = [pdfFile(await buildPdf(2), "a.pdf"), pdfFile(await buildPdf(3), "b.pdf")];
    const result = await countPages(files);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("multiple_pdfs");
    }
  });

  it("rejects an empty selection", async () => {
    const result = await countPages([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("empty_selection");
    }
  });
});

describe("countPages — failure reasons are mutually distinct", () => {
  it("produces a different reason for each rejection shape", async () => {
    const mixed = await countPages([pdfFile(await buildPdf(1)), imageFile("a.jpg")]);
    const multiple = await countPages([pdfFile(await buildPdf(1), "a.pdf"), pdfFile(await buildPdf(1), "b.pdf")]);
    const empty = await countPages([]);

    const reasons = [mixed, multiple, empty].map((result) => (result.ok ? null : result.reason));
    expect(reasons).toEqual(["mixed_selection", "multiple_pdfs", "empty_selection"]);
    expect(new Set(reasons).size).toBe(3);
  });
});
