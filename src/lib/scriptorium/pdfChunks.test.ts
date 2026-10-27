import { describe, it, expect, vi } from "vitest";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFString,
} from "pdf-lib";
import {
  planPdfChunks,
  PdfPageTooLargeError,
  splitPagesHtml,
  chunkPagesHtml,
  withBusyRetry,
  mergePdfs,
  pdfProgressLabel,
  utf8ByteLength,
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

  it("defaults to the 40 MB one request render-pdf always accepted", () => {
    expect(PDF_CHUNK_BUDGET_BYTES).toBe(40 * 1024 * 1024);
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

describe("utf8ByteLength", () => {
  it.each([
    ["ascii", "Hello, world"],
    ["accented", "café Ünïcödé ñ"],
    ["CJK", "龍の書 ドラゴン"],
    ["emoji", "a 🐉 b 🧙‍♂️ c"],
    ["empty", ""],
    ["lone surrogate", "x\ud83dy"],
  ])("matches TextEncoder for %s", (_label, text) => {
    expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
  });
});

const N = (name: string) => PDFName.of(name);

/** A part with a title, a heading on each page, and a bookmark per heading. */
async function partWithNav(opts: { title?: string; tag: string; style: "legacy" | "tree"; indirect?: boolean }) {
  const doc = await PDFDocument.create();
  if (opts.title) doc.setTitle(opts.title, { showInWindowTitleBar: true });
  const pages = [doc.addPage([100, 200]), doc.addPage([110, 200])];
  const ctx = doc.context;
  // `indirect` stores destinations and titles as references, as many writers do.
  const dest = (i: number) => {
    const arr = ctx.obj([pages[i].ref, N("XYZ"), null, null, null]);
    return opts.indirect ? ctx.register(arr) : arr;
  };
  const text = (t: string) => (opts.indirect ? ctx.register(PDFHexString.fromText(t)) : PDFHexString.fromText(t));
  const names = [`${opts.tag}-a`, `${opts.tag}-b`];
  if (opts.style === "legacy") {
    doc.catalog.set(N("Dests"), ctx.obj({ [names[0]]: dest(0), [names[1]]: dest(1) }));
  } else {
    const leaf = (key: string, i: number) => ctx.register(ctx.obj({ Names: [PDFString.of(key), dest(i)] }));
    const root = ctx.obj({ Kids: [leaf(names[0], 0), leaf(names[1], 1)] });
    doc.catalog.set(N("Names"), ctx.obj({ Dests: root }));
  }
  const root = ctx.obj({}) as PDFDict;
  const rootRef = ctx.register(root);
  const child = ctx.obj({ Title: text("Child"), Parent: rootRef, Dest: dest(1) });
  const childRef = ctx.register(child);
  const top = ctx.obj({
    Title: text(`Top ${opts.tag}`),
    Parent: rootRef,
    Dest: dest(0),
    First: childRef,
    Last: childRef,
    Count: 1,
  });
  const topRef = ctx.register(top);
  child.set(N("Parent"), topRef);
  root.set(N("Type"), N("Outlines"));
  root.set(N("First"), topRef);
  root.set(N("Last"), topRef);
  root.set(N("Count"), PDFNumber.of(2));
  doc.catalog.set(N("Outlines"), rootRef);
  return doc.save();
}

describe("mergePdfs navigation", () => {
  async function mergedDoc() {
    const bytes = await mergePdfs([
      await partWithNav({ title: "The Book", tag: "p1", style: "legacy" }),
      await partWithNav({ tag: "p2", style: "tree" }),
    ]);
    return PDFDocument.load(bytes);
  }

  const pageIndexOf = (doc: PDFDocument, ref: unknown) =>
    doc.getPages().findIndex((p) => ref instanceof PDFRef && p.ref.tag === ref.tag);

  function destPage(doc: PDFDocument, value: unknown): number {
    const arr = value instanceof PDFDict ? value.lookup(N("D")) : value;
    return pageIndexOf(doc, (arr as PDFArray).get(0));
  }

  it("keeps the title, shown in the window title bar", async () => {
    const doc = await mergedDoc();
    expect(doc.getTitle()).toBe("The Book");
    const prefs = doc.catalog.lookup(N("ViewerPreferences"), PDFDict);
    expect(prefs.get(N("DisplayDocTitle"))?.toString()).toBe("true");
  });

  it("resolves old-style and name-tree destinations to the right merged page", async () => {
    const doc = await mergedDoc();
    const legacy = doc.catalog.lookup(N("Dests"), PDFDict);
    expect(destPage(doc, legacy.lookup(N("p1-a")))).toBe(0);
    expect(destPage(doc, legacy.lookup(N("p1-b")))).toBe(1);

    const tree = doc.catalog.lookup(N("Names"), PDFDict).lookup(N("Dests"), PDFDict);
    const flat = tree.lookup(N("Names"), PDFArray);
    const byName = new Map<string, unknown>();
    for (let i = 0; i < flat.size(); i += 2) byName.set((flat.lookup(i) as PDFString).decodeText(), flat.lookup(i + 1));
    expect([...byName.keys()]).toEqual(["p2-a", "p2-b"]);
    expect(destPage(doc, byName.get("p2-a"))).toBe(2);
    expect(destPage(doc, byName.get("p2-b"))).toBe(3);
  });

  it("joins both parts' bookmarks into one linked tree pointing at the right pages", async () => {
    const doc = await mergedDoc();
    const root = doc.catalog.lookup(N("Outlines"), PDFDict);
    expect(root.lookup(N("Count"), PDFNumber).asNumber()).toBe(4);
    const first = root.lookup(N("First"), PDFDict);
    const second = first.lookup(N("Next"), PDFDict);
    expect(root.lookup(N("Last"))).toBe(second);
    expect(first.lookup(N("Title"), PDFHexString).decodeText()).toBe("Top p1");
    expect(second.lookup(N("Title"), PDFHexString).decodeText()).toBe("Top p2");
    expect(second.lookup(N("Prev"))).toBe(first);
    expect(first.lookup(N("Parent"))).toBe(root);
    expect(destPage(doc, first.lookup(N("Dest")))).toBe(0);
    expect(destPage(doc, second.lookup(N("Dest")))).toBe(2);
    const child = second.lookup(N("First"), PDFDict);
    expect(destPage(doc, child.lookup(N("Dest")))).toBe(3);
    expect(child.lookup(N("Parent"))).toBe(second);
  });
});

describe("mergePdfs with indirect destinations", () => {
  it("resolves a later part's references in that part, not in the merged document", async () => {
    const doc = await PDFDocument.load(
      await mergePdfs([
        await partWithNav({ tag: "p1", style: "legacy" }),
        await partWithNav({ tag: "p3", style: "legacy", indirect: true }),
      ]),
    );
    const pageOf = (value: unknown) =>
      doc.getPages().findIndex((p) => {
        const first = (value as PDFArray).get(0);
        return first instanceof PDFRef && p.ref.tag === first.tag;
      });
    const legacy = doc.catalog.lookup(N("Dests"), PDFDict);
    expect(pageOf(legacy.lookup(N("p3-a")))).toBe(2);
    expect(pageOf(legacy.lookup(N("p3-b")))).toBe(3);
    const second = doc.catalog.lookup(N("Outlines"), PDFDict).lookup(N("Last"), PDFDict);
    expect(second.lookup(N("Title"), PDFHexString).decodeText()).toBe("Top p3");
    expect(second.lookup(N("First"), PDFDict).lookup(N("Title"), PDFHexString).decodeText()).toBe("Child");
  });
});

describe("pdfProgressLabel", () => {
  it("names the part only for a multi-part book", () => {
    expect(pdfProgressLabel(null)).toBe("Building…");
    expect(pdfProgressLabel({ part: 1, total: 1 })).toBe("Building…");
    expect(pdfProgressLabel({ part: 2, total: 4 })).toBe("Building part 2 of 4…");
  });
});
