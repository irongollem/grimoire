import { describe, it, expect, vi } from "vitest";

// The module under test never runs Paged.js here, but importing
// the module still pulls in the real `pagedjs` package (used by
// exportPdf(), left untested here: it needs real layout and the network).
// Stub it so this file doesn't pay for or depend on its real behaviour.
vi.mock("pagedjs", () => ({ Previewer: class {}, Handler: class {}, registerHandlers: vi.fn() }));

import { sanitizePdfFilename, verifyPrintedPdf } from "./useScriptoriumPdf";

describe("sanitizePdfFilename", () => {
  it("appends .pdf", () => {
    expect(sanitizePdfFilename("My Adventure")).toBe("My Adventure.pdf");
  });

  it("strips characters illegal in filenames and collapses whitespace", () => {
    expect(sanitizePdfFilename('  The  "Lost" / Mine: <Part 1>?  ')).toBe("The Lost Mine Part 1.pdf");
  });

  it("never lets a title start a hidden file or climb out of the downloads folder", () => {
    expect(sanitizePdfFilename("..hidden")).toBe("hidden.pdf");
    expect(sanitizePdfFilename("../../etc/passwd")).toBe("etcpasswd.pdf");
  });

  it("falls back to Untitled", () => {
    expect(sanitizePdfFilename("")).toBe("Untitled.pdf");
    expect(sanitizePdfFilename("///")).toBe("Untitled.pdf");
  });

  it("names a file with campaign data", () => {
    expect(sanitizePdfFilename("Curse", true)).toBe("Curse (with campaign data).pdf");
  });
});

describe("verifyPrintedPdf", () => {
  const expected = [
    { index: 0, label: "1", text: "The goblins crept along the flooded corridor", ignorable: [] },
    { index: 1, label: "2", text: "Nothing waited in the cellar but cold water", ignorable: [] },
  ];
  const pages = [
    { chapterId: "ch-a", pageInChapter: 1, globalIndex: 0, blank: false, cover: false, label: "1" },
    { chapterId: "ch-a", pageInChapter: 2, globalIndex: 1, blank: false, cover: false, label: "2" },
  ];
  const bytes = new Uint8Array([1]);

  it("says all pages printed as laid out when they did", async () => {
    const read = async () => ["The goblins crept along the flooded corridor", "Nothing waited in the cellar but cold water"];
    expect(await verifyPrintedPdf(bytes, expected, pages, read)).toEqual({ status: "done", pageCount: 2, mismatches: [] });
  });

  it("names the page that printed differently with the chapter page the editor can show", async () => {
    const read = async () => ["The goblins crept along the flooded corridor", "Nothing waited in the cellar"];
    const state = await verifyPrintedPdf(bytes, expected, pages, read);
    expect(state).toEqual({
      status: "done",
      pageCount: 2,
      mismatches: [
        { index: 1, label: "Page 2", reason: "ends with different words", chapterId: "ch-a", pageInChapter: 2 },
      ],
    });
  });

  it("gives an extra page no place to jump to", async () => {
    const read = async () => [...expected.map((p) => p.text), "stray"];
    const state = await verifyPrintedPdf(bytes, expected, pages, read);
    expect(state).toMatchObject({ mismatches: [{ reason: "extra page", chapterId: null, pageInChapter: null }] });
  });

  it("reports the check as unavailable, claiming nothing, when pdf.js cannot read the file", async () => {
    const read = async (): Promise<string[]> => {
      throw new Error("InvalidPDFException");
    };
    expect(await verifyPrintedPdf(bytes, expected, pages, read)).toEqual({ status: "unavailable" });
  });
});
