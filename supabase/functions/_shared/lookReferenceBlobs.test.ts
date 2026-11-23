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

const SAFE = (n: number) => `https://ref.supabase.co/storage/v1/object/public/canon/look-${n}.webp`;

describe("lookReferenceBlobs (#1252)", () => {
  it("never fetches a URL outside our storage", async () => {
    // Bug: the DM-written URL list reaching fetch unguarded is an SSRF probe.
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["x"])) }));
    vi.stubGlobal("fetch", fetchMock);
    const blobs = await lookReferenceBlobs(["http://169.254.169.254/latest/meta-data", SAFE(1)]);
    expect(blobs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SAFE(1));
  });

  it("skips a picture that is gone or throws, keeping the rest", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      if (url === SAFE(2)) return Promise.resolve({ ok: false, blob: () => Promise.resolve(new Blob()) });
      if (url === SAFE(3)) return Promise.reject(new Error("net"));
      return Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["x"])) });
    }));
    expect(await lookReferenceBlobs([SAFE(1), SAFE(2), SAFE(3)])).toHaveLength(1);
  });

  it("fetches at most four", async () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(["x"])) }));
    vi.stubGlobal("fetch", fetchMock);
    await lookReferenceBlobs([1, 2, 3, 4, 5, 6].map(SAFE));
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
