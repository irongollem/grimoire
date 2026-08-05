import { describe, it, expect, vi, afterEach } from "vitest";
import { readEmbeddedXmp, inheritXmpIntoVariant, parsePublicUrl, getPublicUrl, BUCKETS, type BucketConfig, type BucketKey } from "./storage";
import { embedXmpInWebp, embedXmpInPng, readXmpFromWebp } from "@edge-shared/provenance/embed.ts";
import { CDN_BUCKET_IDS, assetCdnUrl } from "@edge-shared/cdn-buckets.ts";

// Minimal fixture builders — independently transcribed (not imported from
// embed.ts's own test file), mirroring the pattern already used across
// supabase/functions/_shared/provenance/*.test.ts.

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

function u32be(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: number[]): number[] {
  const crc = crc32(new Uint8Array([...ascii(type), ...data]));
  return [...u32be(data.length), ...ascii(type), ...data, ...u32be(crc)];
}

// Return type is intentionally inferred (not annotated `Uint8Array`) —
// same reasoning as localKeyVault.ts's `fromBase64`: a bare `Uint8Array`
// annotation widens to `Uint8Array<ArrayBufferLike>`, which BlobPart rejects.
function buildMinimalPng() {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const ihdr = pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const idat = pngChunk("IDAT", [0, 1, 2, 3]);
  const iend = pngChunk("IEND", []);
  return new Uint8Array([...signature, ...ihdr, ...idat, ...iend]);
}

function riffChunk(fourCC: string, data: number[]): number[] {
  const pad = data.length % 2 === 1 ? [0] : [];
  return [...ascii(fourCC), ...u32le(data.length), ...data, ...pad];
}

// Minimal lossless (VP8L) WebP, 1x1 no-alpha.
function buildMinimalWebp() {
  const vp8lData = [0x2f, 0x00, 0x00, 0x00, 0x00];
  const payload = [...ascii("WEBP"), ...riffChunk("VP8L", vp8lData)];
  return new Uint8Array([...ascii("RIFF"), ...u32le(payload.length), ...payload]);
}

// embed.ts's embedXmpIn* functions have a bare `Uint8Array` return
// annotation (widens to `Uint8Array<ArrayBufferLike>`); re-wrap before
// handing the result to `new Blob(...)`.
function toBlobPart(bytes: Uint8Array) {
  return new Uint8Array(bytes);
}

describe("readEmbeddedXmp", () => {
  it("reads a packet embedded in a PNG blob", async () => {
    const marked = embedXmpInPng(buildMinimalPng(), "packet-from-png");
    const blob = new Blob([toBlobPart(marked)], { type: "image/png" });
    expect(await readEmbeddedXmp(blob)).toBe("packet-from-png");
  });

  it("reads a packet embedded in a WebP blob", async () => {
    const marked = embedXmpInWebp(buildMinimalWebp(), "packet-from-webp");
    const blob = new Blob([toBlobPart(marked)], { type: "image/webp" });
    expect(await readEmbeddedXmp(blob)).toBe("packet-from-webp");
  });

  it("returns null for an unmarked image", async () => {
    const blob = new Blob([buildMinimalWebp()], { type: "image/webp" });
    expect(await readEmbeddedXmp(blob)).toBeNull();
  });

  it("sniffs the real format rather than trusting a mismatched blob.type", async () => {
    // Actual bytes are PNG (marked), but the blob is labelled webp — a
    // b64-derived blob routinely is. The packet must still be found.
    const marked = embedXmpInPng(buildMinimalPng(), "packet-despite-wrong-label");
    const blob = new Blob([toBlobPart(marked)], { type: "image/webp" });
    expect(await readEmbeddedXmp(blob)).toBe("packet-despite-wrong-label");
  });

  it("returns null for bytes in no recognised image format", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" });
    expect(await readEmbeddedXmp(blob)).toBeNull();
  });
});

describe("inheritXmpIntoVariant", () => {
  it("embeds the given packet into an unmarked webp variant", async () => {
    const variant = new Blob([buildMinimalWebp()], { type: "image/webp" });
    const result = await inheritXmpIntoVariant(variant, "inherited-packet");
    const bytes = new Uint8Array(await result.arrayBuffer());
    expect(readXmpFromWebp(bytes)).toBe("inherited-packet");
  });

  it("leaves the variant untouched when there is no packet to inherit", async () => {
    const variant = new Blob([buildMinimalWebp()], { type: "image/webp" });
    const result = await inheritXmpIntoVariant(variant, null);
    expect(result).toBe(variant);
  });

  it("falls back to the unmarked variant rather than throwing on malformed bytes", async () => {
    const variant = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/webp" });
    const result = await inheritXmpIntoVariant(variant, "some-packet");
    const bytes = new Uint8Array(await result.arrayBuffer());
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});

// ── Asset CDN (#577 stage 1) ──────────────────────────────────────────────

const bucketEntries = Object.entries(BUCKETS) as [BucketKey, BucketConfig][];

describe("CDN bucket registry", () => {
  // The list is declared twice — once as a per-bucket `cdn` flag carrying the
  // reasoning, once as CDN_BUCKET_IDS in _shared so Deno can read it (it cannot
  // resolve `@/`). These assertions are what make that safe: neither list can
  // drift without a red test.
  it("agrees with CDN_BUCKET_IDS in both directions", () => {
    const fromRegistry = bucketEntries.filter(([, c]) => c.cdn).map(([, c]) => c.id).sort();
    expect(fromRegistry).toEqual([...CDN_BUCKET_IDS].sort());
  });

  it("keeps sounds and mini-models off the CDN", () => {
    // sounds: bulk non-HTML through a proxied Free/Pro zone.
    // mini-models: goes straight to R2 in stage 2 while the bucket is empty.
    expect(BUCKETS.sounds.cdn).toBe(false);
    expect(BUCKETS.miniModels.cdn).toBe(false);
  });
});

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
    expect(assetCdnUrl("sounds", "u/a.ogg", base)).toBeNull();
    expect(assetCdnUrl("mini-models", "u/m/model.stl", base)).toBeNull();
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
    // downtime-images and bug-reports are deliberately unregistered.
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

  it("uses the CDN for a CDN-fronted bucket once the env var is set", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
    vi.resetModules();
    const fresh = await import("./storage");
    expect(fresh.getPublicUrl("npcPortraits", "u1/a.webp")).toBe(
      "https://cdn.example.com/npc-portraits/u1/a.webp",
    );
  });

  it("still uses the origin for sounds and mini-models when the CDN is set", async () => {
    vi.stubEnv("VITE_ASSET_CDN_URL", "https://cdn.example.com");
    vi.resetModules();
    const fresh = await import("./storage");
    expect(fresh.getPublicUrl("sounds", "u1/a.ogg")).toContain(
      "/storage/v1/object/public/sounds/u1/a.ogg",
    );
    expect(fresh.getPublicUrl("miniModels", "u1/m/model.stl")).toContain(
      "/storage/v1/object/public/mini-models/u1/m/model.stl",
    );
  });
});
