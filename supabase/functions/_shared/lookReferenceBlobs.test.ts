import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookReferenceBlobs } from "./lookReferenceBlobs.ts";

type DenoEnvStub = { env: { get(key: string): string | undefined } };
const g = globalThis as typeof globalThis & { Deno?: DenoEnvStub };

beforeEach(() => {
  g.Deno = { env: { get: (k: string) => (k === "SUPABASE_URL" ? "https://ref.supabase.co" : undefined) } };
});
afterEach(() => {
  delete g.Deno;
  vi.unstubAllGlobals();
});

const good = (type = "image/webp", size = 1) => ({
  ok: true,
  headers: { get: () => type },
  arrayBuffer: () => Promise.resolve(new Uint8Array(size).buffer),
});
const SAFE = (n: number) => `https://ref.supabase.co/storage/v1/object/public/canon/look-${n}.webp`;

describe("lookReferenceBlobs (#1252)", () => {
  it("never fetches a URL outside our storage", async () => {
    // Bug: the DM-written URL list reaching fetch unguarded is an SSRF probe.
    const fetchMock = vi.fn(() => Promise.resolve(good()));
    vi.stubGlobal("fetch", fetchMock);
    const blobs = await lookReferenceBlobs(["http://169.254.169.254/latest/meta-data", SAFE(1)]);
    expect(blobs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SAFE(1), expect.objectContaining({ redirect: "error" }));
  });

  it("skips a picture that is gone or throws, keeping the rest", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === SAFE(2)) return Promise.resolve({ ...good(), ok: false });
      if (url === SAFE(3)) return Promise.reject(new Error("net"));
      return Promise.resolve(good());
    }));
    expect(await lookReferenceBlobs([SAFE(1), SAFE(2), SAFE(3)])).toHaveLength(1);
  });

  it("fetches at most four", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(good()));
    vi.stubGlobal("fetch", fetchMock);
    await lookReferenceBlobs([1, 2, 3, 4, 5, 6].map(SAFE));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("skips a picture that is not an image or is over the cap, keeping a good one", async () => {
    // Bug caught: a 200 with an HTML or oversized body was passed on as a style picture and made the provider answer 400.
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === SAFE(2)) return Promise.resolve(good("text/html"));
      if (url === SAFE(3)) return Promise.resolve(good("image/png", 8 * 1024 * 1024 + 1));
      return Promise.resolve(good());
    }));
    const blobs = await lookReferenceBlobs([SAFE(1), SAFE(2), SAFE(3)]);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe("image/webp");
  });

  it("skips a picture whose fetch is aborted or redirected", async () => {
    // Bug caught: a hanging or redirecting URL stalls or fails every generator instead of being skipped.
    vi.stubGlobal("fetch", vi.fn((url: string) => url === SAFE(2) ? Promise.reject(new DOMException("t", "TimeoutError")) : Promise.resolve(good())));
    expect(await lookReferenceBlobs([SAFE(1), SAFE(2)])).toHaveLength(1);
  });
});
