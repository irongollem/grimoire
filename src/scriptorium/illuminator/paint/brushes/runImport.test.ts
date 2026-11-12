import { describe, expect, it, vi } from "vitest";
import { runImport, type ImportWorker } from "./runImport";

function fakeWorker(react: (w: ImportWorker) => void): ImportWorker & { terminate: ReturnType<typeof vi.fn> } {
  const w = { onmessage: null, onerror: null, terminate: vi.fn(), postMessage: () => react(w as unknown as ImportWorker) } as unknown as ImportWorker & { terminate: ReturnType<typeof vi.fn> };
  return w;
}

describe("runImport", () => {
  it("rejects when the worker answers with an error, so the caller's busy flag can be cleared", async () => {
    // Fails on: an importer that throws leaving the promise pending forever and the Import button spinning.
    const w = fakeWorker((x) => x.onmessage?.({ data: { ok: false, message: "boom" } } as never));
    await expect(runImport("a.abr", new Uint8Array(1), () => w)).rejects.toThrow("boom");
    expect(w.terminate).toHaveBeenCalled();
  });
  it("rejects when the worker dies", async () => {
    // Fails on: a crashed worker (a bad bundle, out of memory) hanging the import.
    const w = fakeWorker((x) => x.onerror?.({}));
    await expect(runImport("a.abr", new Uint8Array(1), () => w)).rejects.toThrow(/could not be read/);
  });
  it("resolves with the result of a good reply and ends the worker", async () => {
    const result = { brushes: [], skipped: [] };
    const w = fakeWorker((x) => x.onmessage?.({ data: { ok: true, result } } as never));
    await expect(runImport("a.abr", new Uint8Array(1), () => w)).resolves.toBe(result);
    expect(w.terminate).toHaveBeenCalled();
  });
});
