import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePublicUrl, getPublicUrl } from "./urls";
import { BUCKETS, type BucketConfig, type BucketKey } from "./buckets";
import { assetCdnUrl } from "@edge-shared/cdn-buckets.ts";

const bucketEntries = Object.entries(BUCKETS) as [BucketKey, BucketConfig][];

describe("assetCdnUrl", () => {
  const base = "https://cdn.example.com";

  it("builds <base>/<bucket>/<path> with no Supabase routing prefix", () => {
    // The absent /storage/v1/object/public prefix is the point: this path is
    // also the stage-2 R2 object key.
    expect(assetCdnUrl("npc-portraits", "user-1/abc.webp", base)).toBe(
      "https://cdn.example.com/npc-portraits/user-1/abc.webp",
    );
  });

  it("tolerates a trailing slash on the base", () => {
    expect(assetCdnUrl("item-images", "u/a.webp", "https://cdn.example.com/")).toBe(
      "https://cdn.example.com/item-images/u/a.webp",
    );
  });

  it("percent-encodes each segment but keeps separators", () => {
    expect(assetCdnUrl("chronicle", "user 1/a b.webp", base)).toBe(
      "https://cdn.example.com/chronicle/user%201/a%20b.webp",
    );
  });

  it("returns null for a bucket that is not CDN-fronted", () => {
    expect(assetCdnUrl("downtime-images", "srd/carouse.webp", base)).toBeNull();
    expect(assetCdnUrl("bug-reports", "u/a.png", base)).toBeNull();
  });

  it("returns null when no CDN is configured", () => {
    expect(assetCdnUrl("npc-portraits", "u/a.webp", null)).toBeNull();
  });
});

describe("parsePublicUrl", () => {
  it("parses the Supabase origin shape", () => {
    expect(
      parsePublicUrl("https://ref.supabase.co/storage/v1/object/public/npc-portraits/u1/a.webp"),
    ).toEqual({ bucket: "npcPortraits", path: "u1/a.webp" });
  });

  it("parses the CDN shape", () => {
    expect(parsePublicUrl("https://cdn.example.com/npc-portraits/u1/a.webp")).toEqual({
      bucket: "npcPortraits",
      path: "u1/a.webp",
    });
  });

  it("is host-agnostic — any CDN hostname resolves the same", () => {
    // Rows written before, during and after a stage-2 origin swap coexist
    // indefinitely; parsing must never depend on the currently-configured host.
    expect(parsePublicUrl("https://assets.example.org/item-images/u1/a.webp")?.path).toBe("u1/a.webp");
  });

  it("still resolves origin-shaped URLs for a bucket whose bytes moved to R2", () => {
    // mini-models rows written before stage 2 hold Supabase origin URLs, and the
    // objects behind them stay readable through the Worker's fallback. If this
    // stopped parsing, every delete for those rows would silently no-op.
    expect(
      parsePublicUrl("https://ref.supabase.co/storage/v1/object/public/mini-models/u1/m/model.stl"),
    ).toEqual({ bucket: "miniModels", path: "u1/m/model.stl" });
  });

  it("strips a cache-busting query string from the path", () => {
    // MiniPortraitOverlay and MiniSculptStep append `?v=<updated_at>`. Before
    // this, the query rode along into the storage path and the delete silently
    // matched nothing.
    expect(parsePublicUrl("https://cdn.example.com/chronicle/u1/a.webp?v=123")).toEqual({
      bucket: "chronicle",
      path: "u1/a.webp",
    });
    expect(
      parsePublicUrl("https://ref.supabase.co/storage/v1/object/public/chronicle/u1/a.webp?v=123"),
    ).toEqual({ bucket: "chronicle", path: "u1/a.webp" });
  });

  it("decodes percent-encoded paths", () => {
    expect(parsePublicUrl("https://cdn.example.com/chronicle/user%201/a%20b.webp")?.path).toBe(
      "user 1/a b.webp",
    );
  });

  it("returns null for buckets outside the registry and for foreign URLs", () => {
    // downtime-images is deliberately unregistered.
    expect(parsePublicUrl("https://cdn.example.com/downtime-images/srd/carouse.webp")).toBeNull();
    expect(parsePublicUrl("https://images.example.com/some/external.png")).toBeNull();
    expect(parsePublicUrl("not a url")).toBeNull();
    expect(parsePublicUrl("")).toBeNull();
  });

  it("round-trips every CDN-fronted bucket through assetCdnUrl", () => {
    for (const [key, cfg] of bucketEntries) {
      if (!cfg.cdn) continue;
      const url = assetCdnUrl(cfg.id, "u1/a.webp", "https://cdn.example.com");
      expect(url).not.toBeNull();
      expect(parsePublicUrl(url as string)).toEqual({ bucket: key, path: "u1/a.webp" });
    }
  });
});

describe("getPublicUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the Supabase origin when VITE_ASSET_CDN_URL is unset", () => {
    // Deploying stage 1's code before the DNS zone exists must be a no-op.
    expect(getPublicUrl("npcPortraits", "u1/a.webp")).toContain(
      "/storage/v1/object/public/npc-portraits/u1/a.webp",
    );
  });

  it("uses the CDN for every bucket once the env var is set", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
    vi.resetModules();
    const fresh = await import("./urls");
    expect(fresh.getPublicUrl("npcPortraits", "u1/a.webp")).toBe(
      "https://cdn.example.com/npc-portraits/u1/a.webp",
    );
    // sounds opted in — shared playback multiplies origin egress by party size.
    expect(fresh.getPublicUrl("sounds", "u1/a.ogg")).toBe("https://cdn.example.com/sounds/u1/a.ogg");
    // mini-models is R2-backed, so the CDN URL is the only one that resolves.
    expect(fresh.getPublicUrl("miniModels", "u1/m/model.stl")).toBe(
      "https://cdn.example.com/mini-models/u1/m/model.stl",
    );
  });
});
