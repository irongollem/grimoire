import { afterEach, describe, expect, it, vi } from "vitest";
import { canReadPdf, readPdfPageTexts } from "./pdfPageTexts";

describe("canReadPdf", () => {
  // Fails if the gate is dropped: on Safari before 17.4 pdf.js would load and throw inside its worker.
  it("refuses an engine without Promise.withResolvers", () => {
    const old = { ...Promise } as unknown as PromiseConstructor;
    expect(canReadPdf(old)).toBe(false);
  });

  it("accepts an engine that has it", () => {
    expect(canReadPdf(Promise)).toBe(true);
  });
});

describe("readPdfPageTexts", () => {
  const original = (Promise as unknown as Record<string, unknown>).withResolvers;
  afterEach(() => {
    (Promise as unknown as Record<string, unknown>).withResolvers = original;
  });

  // Fails if the read loads pdf.js before asking: the rejection is what turns the print check "unavailable".
  it("rejects before loading pdf.js on an engine without Promise.withResolvers", async () => {
    (Promise as unknown as Record<string, unknown>).withResolvers = undefined;
    const spy = vi.fn();
    vi.doMock("pdfjs-dist", () => {
      spy();
      return {};
    });
    await expect(readPdfPageTexts(new Uint8Array())).rejects.toThrow(/withResolvers/);
    expect(spy).not.toHaveBeenCalled();
    vi.doUnmock("pdfjs-dist");
  });
});
