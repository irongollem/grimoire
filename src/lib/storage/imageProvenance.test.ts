import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AiProvenance } from "@edge-shared/provenance/types.ts";

interface Result {
  data: unknown;
  error: unknown;
}

const inFn = vi.fn<(column: string, values: string[]) => Promise<Result>>();
const select = vi.fn((_columns: string) => ({ in: inFn }));
const upsert = vi.fn<(row: unknown, options: unknown) => Promise<Result>>();
const eqStem = vi.fn<(column: string, value: string) => Promise<Result>>();
const eqBucket = vi.fn((_column: string, _value: string) => ({ eq: eqStem }));
const deleteFn = vi.fn(() => ({ eq: eqBucket }));
const from = vi.fn((_table: string) => ({ select, upsert, delete: deleteFn }));

vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => from(table) } }));

const PROV: AiProvenance = {
  generatorType: "npc",
  provider: "openai",
  model: "gpt-image-1",
  generatedAt: "2026-08-04T12:00:00.000Z",
  edited: false,
};

const ORIGIN = "https://ref.supabase.co/storage/v1/object/public";

/** Fresh module per test: the found-cache and pending batch are module state. */
async function load() {
  vi.resetModules();
  return import("./imageProvenance");
}

beforeEach(() => {
  vi.clearAllMocks();
  inFn.mockResolvedValue({ data: [], error: null });
  upsert.mockResolvedValue({ data: null, error: null });
  eqStem.mockResolvedValue({ data: null, error: null });
});

describe("imageProvenanceKey", () => {
  it("keys an origin URL by bucket id and stem", async () => {
    const { imageProvenanceKey } = await load();
    expect(imageProvenanceKey(`${ORIGIN}/npc-portraits/u1/abc.webp`)).toEqual({
      bucket: "npc-portraits",
      stem: "u1/abc",
    });
  });

  it("gives a variant URL and the original the same key", async () => {
    const { imageProvenanceKey } = await load();
    expect(imageProvenanceKey(`${ORIGIN}/npc-portraits/u1/abc_w400.webp?v=3`)).toEqual(
      imageProvenanceKey(`${ORIGIN}/npc-portraits/u1/abc.jpeg`),
    );
  });

  it("accepts the CDN shape", async () => {
    const { imageProvenanceKey } = await load();
    expect(imageProvenanceKey("https://cdn.example.com/monster-images/srd/owl.webp")).toEqual({
      bucket: "monster-images",
      stem: "srd/owl",
    });
  });

  it("returns null outside the registered buckets and for local URLs", async () => {
    const { imageProvenanceKey } = await load();
    expect(imageProvenanceKey("https://elsewhere.example.com/nope/a.webp")).toBeNull();
    expect(imageProvenanceKey("blob:http://localhost/1234")).toBeNull();
    expect(imageProvenanceKey("data:image/webp;base64,AAAA")).toBeNull();
    expect(imageProvenanceKey("")).toBeNull();
  });
});

describe("registerImageProvenance", () => {
  it("upserts on (bucket, stem) with the variant suffix removed", async () => {
    const { registerImageProvenance } = await load();
    await registerImageProvenance("npcPortraits", "u1/abc_w400.webp", PROV, "u1");
    expect(from).toHaveBeenCalledWith("image_provenance");
    expect(upsert).toHaveBeenCalledWith(
      { bucket: "npc-portraits", stem: "u1/abc", user_id: "u1", provenance: PROV },
      { onConflict: "bucket,stem" },
    );
  });

  it("throws on a database error", async () => {
    const { registerImageProvenance } = await load();
    upsert.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(registerImageProvenance("npcPortraits", "u1/abc.webp", PROV, "u1")).rejects.toThrow("denied");
  });

  it("makes the record readable without a query", async () => {
    const { registerImageProvenance, loadImageProvenance } = await load();
    await registerImageProvenance("npcPortraits", "u1/abc.webp", PROV, "u1");
    await expect(loadImageProvenance({ bucket: "npc-portraits", stem: "u1/abc" })).resolves.toEqual(PROV);
    expect(inFn).not.toHaveBeenCalled();
  });
});

describe("clearImageProvenance", () => {
  it("deletes the key's row", async () => {
    const { clearImageProvenance } = await load();
    await clearImageProvenance("npcPortraits", "u1/abc.webp");
    expect(eqBucket).toHaveBeenCalledWith("bucket", "npc-portraits");
    expect(eqStem).toHaveBeenCalledWith("stem", "u1/abc");
  });

  it("throws on a database error", async () => {
    const { clearImageProvenance } = await load();
    eqStem.mockResolvedValue({ data: null, error: new Error("boom") });
    await expect(clearImageProvenance("npcPortraits", "u1/abc.webp")).rejects.toThrow("boom");
  });
});

describe("loadImageProvenance", () => {
  it("coalesces calls made in one tick into a single query", async () => {
    const { loadImageProvenance } = await load();
    inFn.mockResolvedValue({
      data: [{ bucket: "npc-portraits", stem: "u1/a", provenance: PROV }],
      error: null,
    });
    const results = await Promise.all([
      loadImageProvenance({ bucket: "npc-portraits", stem: "u1/a" }),
      loadImageProvenance({ bucket: "npc-portraits", stem: "u1/b" }),
      loadImageProvenance({ bucket: "npc-portraits", stem: "u1/a" }),
    ]);
    expect(inFn).toHaveBeenCalledTimes(1);
    expect(inFn).toHaveBeenCalledWith("stem", ["u1/a", "u1/b"]);
    expect(results).toEqual([PROV, null, PROV]);
  });

  it("chunks at 100 stems", async () => {
    const { loadImageProvenance } = await load();
    const calls = Array.from({ length: 250 }, (_, i) =>
      loadImageProvenance({ bucket: "npc-portraits", stem: `u1/${i}` }),
    );
    await Promise.all(calls);
    expect(inFn).toHaveBeenCalledTimes(3);
    expect(inFn.mock.calls.map(([, values]) => values.length)).toEqual([100, 100, 50]);
  });

  it("matches on bucket as well as stem", async () => {
    const { loadImageProvenance } = await load();
    inFn.mockResolvedValue({
      data: [{ bucket: "monster-images", stem: "u1/a", provenance: PROV }],
      error: null,
    });
    await expect(loadImageProvenance({ bucket: "npc-portraits", stem: "u1/a" })).resolves.toBeNull();
  });

  it("resolves a miss to null and asks again next time", async () => {
    const { loadImageProvenance } = await load();
    await expect(loadImageProvenance({ bucket: "npc-portraits", stem: "u1/x" })).resolves.toBeNull();
    await expect(loadImageProvenance({ bucket: "npc-portraits", stem: "u1/x" })).resolves.toBeNull();
    expect(inFn).toHaveBeenCalledTimes(2);
  });

  it("serves a found record from the cache", async () => {
    const { loadImageProvenance } = await load();
    inFn.mockResolvedValue({
      data: [{ bucket: "npc-portraits", stem: "u1/a", provenance: PROV }],
      error: null,
    });
    await loadImageProvenance({ bucket: "npc-portraits", stem: "u1/a" });
    await loadImageProvenance({ bucket: "npc-portraits", stem: "u1/a" });
    expect(inFn).toHaveBeenCalledTimes(1);
  });

  it("rejects every caller in the batch on a database error", async () => {
    const { loadImageProvenance } = await load();
    inFn.mockResolvedValue({ data: null, error: new Error("down") });
    const settled = await Promise.allSettled([
      loadImageProvenance({ bucket: "npc-portraits", stem: "u1/a" }),
      loadImageProvenance({ bucket: "npc-portraits", stem: "u1/b" }),
    ]);
    expect(settled.map((s) => s.status)).toEqual(["rejected", "rejected"]);
  });
});
