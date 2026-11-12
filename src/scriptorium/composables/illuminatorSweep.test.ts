import { beforeEach, describe, expect, it, vi } from "vitest";

const { fake, remove } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake(), remove: vi.fn(async () => undefined) };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/composables/useImageUpload", () => ({ ASSET_IMAGES_BUCKET: "asset-images", removeStorageImages: remove }));

import { clearSweepMarks, markForSweep, sweepIlluminatorFiles } from "./illuminatorSweep";

const asset = (path: string) => `https://x.supabase.co/storage/v1/object/public/asset-images/${path}`;
const bake = asset("u1/ill-bake.webp");
const mask = asset("u1/ill-mask-1.webp");
const original = asset("u1/rte-170.webp");
const theirs = asset("u2/ill-bake.webp");

beforeEach(() => {
  fake.reset();
  remove.mockClear();
  clearSweepMarks();
});

describe("the Illuminator sweep", () => {
  // Fails on: a file another chapter or page still uses being deleted because one save stopped using it.
  it("keeps a marked file the server reports as still in use", async () => {
    fake.onRpc("scriptorium_pictures_in_use", () => [bake]);
    markForSweep(bake, mask);
    await sweepIlluminatorFiles();
    expect(remove).toHaveBeenCalledWith("asset-images", mask);
  });

  // Fails on: a file kept once being kept for good, so it is never collected after a later save drops it.
  it("a kept file is forgotten, and is collected when a later save marks it again", async () => {
    let inUse = [bake];
    fake.onRpc("scriptorium_pictures_in_use", () => inUse);
    markForSweep(bake);
    await sweepIlluminatorFiles();
    expect(remove).not.toHaveBeenCalled();
    inUse = [];
    markForSweep(bake);
    await sweepIlluminatorFiles();
    expect(remove).toHaveBeenCalledWith("asset-images", bake);
  });

  // Fails on: an original, or someone else's file, entering the sweep.
  it("never marks an original or another author's file", async () => {
    fake.onRpc("scriptorium_pictures_in_use", () => []);
    markForSweep(original, theirs, null, undefined, "https://cdn/x.webp");
    await sweepIlluminatorFiles();
    expect(remove).not.toHaveBeenCalled();
    expect(fake.calls.filter((c) => c.kind === "rpc")).toHaveLength(0);
  });

  // Fails on: a failed check deleting everything, or dropping the marks so the files leak.
  it("deletes nothing and keeps the marks when the check fails", async () => {
    fake.failNext("scriptorium_pictures_in_use", { message: "boom" });
    markForSweep(bake);
    await expect(sweepIlluminatorFiles()).rejects.toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
    fake.onRpc("scriptorium_pictures_in_use", () => []);
    await sweepIlluminatorFiles();
    expect(remove).toHaveBeenCalledWith("asset-images", bake);
  });

  // Fails on: sweeping with nothing marked still costing a request.
  it("asks nothing when nothing is marked", async () => {
    await sweepIlluminatorFiles();
    expect(fake.calls).toHaveLength(0);
  });
});
