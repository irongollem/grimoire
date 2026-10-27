// placeholderUrl() routes every placeholder-art call site through artUrl()
// (#864/#877) so placeholder art can move to R2 behind the CDN. artUrl is a
// no-op with the CDN unset or the path unmapped, so this pins the one thing
// that must never change: with no VITE_ASSET_CDN_URL configured (every test
// run, and every deploy before R2 holds the bytes), placeholderUrl must
// resolve to exactly the same local path every call site hard-coded before.
import { beforeEach, describe, it, expect, vi } from "vitest";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import { getPlaceholderFocalPoint, placeholderUrl, updatePlaceholderFocalPointCache } from "./placeholderFocalPoints";

beforeEach(() => {
  fake.reset();
  vi.resetModules();
});

describe("placeholderUrl", () => {
  it("resolves an entity type to its local placeholder path when the CDN is unset", () => {
    expect(placeholderUrl("npc")).toBe("/assets/placeholders/npc.webp");
    expect(placeholderUrl("dungeonfeature")).toBe("/assets/placeholders/dungeonfeature.webp");
  });

});

describe("getPlaceholderFocalPoint / updatePlaceholderFocalPointCache", () => {
  it("returns null for an entity type with no cached focal point", () => {
    expect(getPlaceholderFocalPoint("does-not-exist")).toBeNull();
  });

  it("returns what was just written to the cache", () => {
    updatePlaceholderFocalPointCache("npc", { x: 40, y: 60 });
    expect(getPlaceholderFocalPoint("npc")).toEqual({ x: 40, y: 60 });
  });
});

// The module caches the one read for the life of the page, so each case loads a fresh copy.
describe("initPlaceholderFocalPoints", () => {
  it("loads the saved focal points from the placeholder_focal_points setting, and no other setting", async () => {
    fake.seed("app_settings", [
      { key: "something_else", value: { npc: { x: 1, y: 1 } } },
      { key: "placeholder_focal_points", value: { npc: { x: 40, y: 60 } } },
    ]);
    const fresh = await import("./placeholderFocalPoints");
    await fresh.initPlaceholderFocalPoints();
    expect(fresh.getPlaceholderFocalPoint("npc")).toEqual({ x: 40, y: 60 });
  });

  it("falls back to no focal point, without throwing, when the read fails", async () => {
    fake.failNext("app_settings", { message: "boom" });
    const fresh = await import("./placeholderFocalPoints");
    await expect(fresh.initPlaceholderFocalPoints()).resolves.toBeUndefined();
    expect(fresh.getPlaceholderFocalPoint("npc")).toBeNull();
  });
});
