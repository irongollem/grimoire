import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLookReferences } from "./lookReferences";

afterEach(() => vi.unstubAllGlobals());

describe("fetchLookReferences (#1252)", () => {
  it("skips a picture that fails to load instead of failing the render", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url.endsWith("gone.webp")) return Promise.resolve({ ok: false, blob: () => Promise.resolve(new Blob()) });
      if (url.endsWith("boom.webp")) return Promise.reject(new Error("network"));
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["x"], { type: "image/webp" })) });
    }));
    const blobs = await fetchLookReferences(["https://x/a.webp", "https://x/gone.webp", "https://x/boom.webp"]);
    expect(blobs).toHaveLength(1);
  });

  it("fetches no more than four, the Look entry's cap", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["x"])) }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchLookReferences(["1", "2", "3", "4", "5", "6"]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
