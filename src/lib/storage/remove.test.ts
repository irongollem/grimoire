import { describe, it, expect, vi, beforeEach } from "vitest";

// The dual-store delete wiring is the exact failure surface #577 flags for
// removeByPublicUrl: a delete that reaches only one store leaves the object
// still being served by the Worker's dual-read. These tests pin which store
// gets called, with which paths, for each entry point.

type InvokeArgs = [name: string, options: { body: { bucket: string; paths: string[] } }];

const storageRemove = vi.fn<(paths: string[]) => Promise<{ data: null; error: null }>>(
  async () => ({ data: null, error: null }),
);
const invoke = vi.fn<(...args: InvokeArgs) => Promise<{ data: { deleted: number }; error: null }>>(
  async () => ({ data: { deleted: 0 }, error: null }),
);

const clearImageProvenance = vi.fn<(bucket: string, path: string) => Promise<void>>(async () => undefined);
vi.mock("./imageProvenance", () => ({
  clearImageProvenance: (bucket: string, path: string) => clearImageProvenance(bucket, path),
}));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: { from: vi.fn(() => ({ remove: storageRemove })) },
    functions: { invoke: (...args: InvokeArgs) => invoke(...args) },
  },
  getCurrentUser: () => ({ id: "u1" }),
}));

beforeEach(() => {
  storageRemove.mockClear();
  invoke.mockClear();
  clearImageProvenance.mockReset();
  clearImageProvenance.mockResolvedValue(undefined);
});

/** Import fresh with the CDN configured so usesR2 is true for every bucket. */
async function loadRemove() {
  vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
  vi.resetModules();
  return import("./remove");
}

describe("deleteFromBucket", () => {
  it("deletes from both stores when the bucket is R2-backed", async () => {
    const { deleteFromBucket } = await loadRemove();
    await deleteFromBucket("npcPortraits", ["u1/a.webp"]);

    expect(storageRemove).toHaveBeenCalledWith(["u1/a.webp"]);
    expect(invoke).toHaveBeenCalledWith("r2-delete", {
      body: { bucket: "npc-portraits", paths: ["u1/a.webp"] },
    });
  });

  it("skips R2 entirely when no CDN is configured", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "");
    vi.resetModules();
    const { deleteFromBucket } = await import("./remove");
    await deleteFromBucket("npcPortraits", ["u1/a.webp"]);

    expect(storageRemove).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does nothing for an empty path list", async () => {
    const { deleteFromBucket } = await loadRemove();
    await deleteFromBucket("npcPortraits", []);
    expect(storageRemove).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("removeByPublicUrl", () => {
  it("parses either URL shape and expands every path to its variants", async () => {
    const { removeByPublicUrl } = await loadRemove();
    await removeByPublicUrl(
      "npcPortraits",
      "https://cdn.example.com/npc-portraits/u1/a.webp",
      "https://ref.supabase.co/storage/v1/object/public/npc-portraits/u1/b.webp",
    );

    const supabasePaths = storageRemove.mock.calls[0][0];
    // 2 originals × (1 + 4 variants) — the variant expansion is what stops
    // deleted images leaving their _w200/_w300/_w400/_w600 copies behind.
    expect(supabasePaths).toHaveLength(10);
    expect(supabasePaths).toContain("u1/a.webp");
    expect(supabasePaths).toContain("u1/a_w600.webp");
    expect(supabasePaths).toContain("u1/b_w200.webp");
    expect(invoke.mock.calls[0][1].body.paths).toHaveLength(10);
  });

  it("silently ignores URLs from other buckets and foreign hosts", async () => {
    const { removeByPublicUrl } = await loadRemove();
    await removeByPublicUrl(
      "npcPortraits",
      "https://cdn.example.com/item-images/u1/a.webp",
      "https://images.example.com/external.png",
      null,
      undefined,
    );
    expect(storageRemove).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe("deleteByPublicUrl", () => {
  it("groups mixed-bucket URLs and deletes each group from its own bucket", async () => {
    const { deleteByPublicUrl } = await loadRemove();
    await deleteByPublicUrl(
      "https://cdn.example.com/npc-portraits/u1/a.webp",
      "https://cdn.example.com/item-images/u1/b.webp",
    );

    // One dual-store delete per bucket.
    expect(storageRemove).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenCalledTimes(2);
    const buckets = invoke.mock.calls.map((c) => c[1].body.bucket).sort();
    expect(buckets).toEqual(["item-images", "npc-portraits"]);
  });
});

describe("provenance registry cleanup (#935)", () => {
  it("clears the registry row once per original even when variants are listed", async () => {
    const { removeByPublicUrl } = await loadRemove();
    await removeByPublicUrl(
      "npcPortraits",
      "https://cdn.example.com/npc-portraits/u1/a.webp",
      "https://cdn.example.com/npc-portraits/u1/b.webp",
    );
    expect(clearImageProvenance).toHaveBeenCalledTimes(2);
    expect(clearImageProvenance).toHaveBeenCalledWith("npcPortraits", "u1/a.webp");
    expect(clearImageProvenance).toHaveBeenCalledWith("npcPortraits", "u1/b.webp");
  });

  it("does not clear anything when no object was deleted", async () => {
    const { deleteFromBucket } = await loadRemove();
    await deleteFromBucket("npcPortraits", []);
    expect(clearImageProvenance).not.toHaveBeenCalled();
  });

  it("does not touch the registry for a bucket that holds no images", async () => {
    const { deleteFromBucket } = await loadRemove();
    await deleteFromBucket("sounds", ["library/rain.ogg"]);
    expect(clearImageProvenance).not.toHaveBeenCalled();
  });

  it("keeps the delete successful when clearing the row fails", async () => {
    clearImageProvenance.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { deleteFromBucket } = await loadRemove();
    await expect(deleteFromBucket("npcPortraits", ["u1/a.webp"])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
