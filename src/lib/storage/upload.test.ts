import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildXmpPacket } from "@edge-shared/provenance/xmp.ts";
import type { AiProvenance } from "@edge-shared/provenance/types.ts";
import {
  readEmbeddedXmp,
  inheritXmpIntoVariant,
  canBackfill,
  uploadToBucket,
  uploadWithVariants,
  backfillVariants,
  healVariants,
} from "./upload";
import { embedXmpInWebp, embedXmpInPng, readXmpFromWebp } from "@edge-shared/provenance/embed.ts";

type UploadOptions = { contentType: string; upsert: boolean };
const storageUpload = vi.fn(async (_path: string, _blob: Blob, _options: UploadOptions) => ({
  data: null,
  error: null as { message: string } | null,
}));
const session = vi.hoisted(() => ({ user: { id: "session-user", app_metadata: {} } as { id: string; app_metadata: { role?: string } } | null }));
const r2 = vi.hoisted(() => ({
  on: false,
  uploadToR2: undefined as unknown as (...args: unknown[]) => Promise<unknown>,
}));
const registerImageProvenance = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);
const clearImageProvenance = vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined);

vi.mock("@/lib/supabase", () => ({
  supabase: { storage: { from: vi.fn((id: string) => ({
        upload: storageUpload,
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://ref.supabase.co/storage/v1/object/public/${id}/${path}` } }),
      })) } },
  getCurrentUser: () => session.user,
}));
vi.mock("./r2", () => {
  class R2UnavailableError extends Error {}
  return {
    R2UnavailableError,
    usesR2: () => r2.on,
    uploadToR2: (...args: unknown[]) => r2.uploadToR2(...args),
    uploadAllToR2: async () => ({ uploaded: [], failed: [] }),
  };
});
vi.mock("./imageProvenance", () => ({
  registerImageProvenance: (...args: unknown[]) => registerImageProvenance(...args),
  clearImageProvenance: (...args: unknown[]) => clearImageProvenance(...args),
}));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));
vi.mock("@/lib/mediaConvert", () => ({
  resizeToWebP: async (blob: Blob) => blob,
}));

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

describe("canBackfill", () => {
  const USER = "11111111-1111-4111-8111-111111111111";

  it("always allows the owner's own folder", () => {
    expect(canBackfill("spellImages", `${USER}/a.webp`, USER, false)).toBe(true);
  });

  it("refuses other users' folders, admin or not", () => {
    const other = "22222222-2222-4222-8222-222222222222";
    expect(canBackfill("spellImages", `${other}/a.webp`, USER, false)).toBe(false);
    expect(canBackfill("spellImages", `${other}/a.webp`, USER, true)).toBe(false);
  });

  it("lets only admins backfill the shared srd/ prefix", () => {
    // This is what lets canonical art self-heal: 94 of 97 srd spell originals
    // shipped with zero variants, and the owner-only rule locked them out of
    // backfill permanently — srd/ matches nobody's uuid.
    expect(canBackfill("spellImages", "srd/fireball.webp", USER, true)).toBe(true);
    expect(canBackfill("spellImages", "srd/fireball.webp", USER, false)).toBe(false);
    expect(canBackfill("sounds", "library/rain.ogg", USER, true)).toBe(true);
  });

  it("never opens a prefix the bucket does not declare", () => {
    expect(canBackfill("npcPortraits", "srd/x.webp", USER, true)).toBe(false);
    // mini-models is service-managed: clientWrites false blocks even bases/.
    expect(canBackfill("miniModels", "bases/round25.stl", USER, true)).toBe(false);
  });
});

describe("image provenance registration (#935)", () => {
  const PROV: AiProvenance = {
    generatorType: "npc-portrait",
    provider: "openai",
    model: "gpt-image-1",
    generatedAt: "2026-10-02T10:00:00.000Z",
    edited: false,
  };

  function markedWebp(): Blob {
    const bytes = embedXmpInWebp(buildMinimalWebp(), buildXmpPacket(PROV));
    return new Blob([toBlobPart(bytes)], { type: "image/webp" });
  }
  function plainWebp(): Blob {
    return new Blob([buildMinimalWebp()], { type: "image/webp" });
  }

  beforeEach(() => {
    storageUpload.mockClear();
    storageUpload.mockResolvedValue({ data: null, error: null });
    registerImageProvenance.mockClear();
    registerImageProvenance.mockResolvedValue(undefined);
    clearImageProvenance.mockClear();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("uploadToBucket registers a marked image once, with the parsed provenance and path", async () => {
    const url = await uploadToBucket({ bucket: "npcPortraits", blob: markedWebp(), userId: "u1" });
    expect(url).not.toBeNull();
    expect(registerImageProvenance).toHaveBeenCalledTimes(1);
    const [bucket, path, prov, owner] = registerImageProvenance.mock.calls[0];
    expect(bucket).toBe("npcPortraits");
    expect(path).toMatch(/^u1\/[0-9a-f-]+\.webp$/);
    expect(prov).toMatchObject({ model: PROV.model, provider: PROV.provider });
    expect(owner).toBe("u1");
    expect(clearImageProvenance).not.toHaveBeenCalled();
  });

  it("uploadToBucket registers nothing for an unmarked image at a fresh path", async () => {
    await uploadToBucket({ bucket: "npcPortraits", blob: plainWebp(), userId: "u1" });
    expect(registerImageProvenance).not.toHaveBeenCalled();
    expect(clearImageProvenance).not.toHaveBeenCalled();
  });

  it("uploadToBucket clears the row when an unmarked image overwrites a path", async () => {
    await uploadToBucket({ bucket: "npcPortraits", blob: plainWebp(), path: "u1/fixed.webp", upsert: true });
    expect(clearImageProvenance).toHaveBeenCalledWith("npcPortraits", "u1/fixed.webp");
    expect(registerImageProvenance).not.toHaveBeenCalled();
  });

  it("uploadToBucket never reads a non-image blob for XMP", async () => {
    const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/mpeg" });
    const spy = vi.spyOn(audio, "arrayBuffer");
    await uploadToBucket({ bucket: "sounds", blob: audio, path: "u1/a.mp3", upsert: true });
    expect(spy).not.toHaveBeenCalled();
    expect(registerImageProvenance).not.toHaveBeenCalled();
    expect(clearImageProvenance).not.toHaveBeenCalled();
  });

  it("uploadToBucket still returns the URL when registration fails", async () => {
    registerImageProvenance.mockRejectedValue(new Error("db down"));
    const url = await uploadToBucket({ bucket: "npcPortraits", blob: markedWebp(), userId: "u1" });
    expect(url).not.toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("uploadWithVariants registers the original's path only, once", async () => {
    const url = await uploadWithVariants({ bucket: "npcPortraits", blob: markedWebp(), userId: "u1" });
    expect(url).not.toBeNull();
    expect(registerImageProvenance).toHaveBeenCalledTimes(1);
    const [, path] = registerImageProvenance.mock.calls[0];
    expect(path).not.toMatch(/_w\d+/);
    // original plus four variants were stored
    expect(storageUpload).toHaveBeenCalledTimes(5);
  });

  it("uploadWithVariants registers nothing for an unmarked image", async () => {
    await uploadWithVariants({ bucket: "npcPortraits", blob: plainWebp(), userId: "u1" });
    expect(registerImageProvenance).not.toHaveBeenCalled();
  });

  it("uploadWithVariants still returns the URL when registration fails", async () => {
    registerImageProvenance.mockRejectedValue(new Error("db down"));
    const url = await uploadWithVariants({ bucket: "npcPortraits", blob: markedWebp(), userId: "u1" });
    expect(url).not.toBeNull();
  });
});

const IMAGE_BUCKET_URL = (path: string) => `https://cdn.example.com/npc-portraits/${path}`;

describe("what uploadToBucket accepts and where it files it", () => {
  const webp = (bytes: number) => new Blob([new Uint8Array(bytes)], { type: "image/webp" });

  beforeEach(() => {
    storageUpload.mockClear();
    storageUpload.mockResolvedValue({ data: null, error: null });
    registerImageProvenance.mockClear();
    session.user = { id: "session-user", app_metadata: {} };
    r2.on = false;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("refuses an empty file before touching storage", async () => {
    await expect(uploadToBucket({ bucket: "npcPortraits", blob: webp(0), userId: "u1" })).rejects.toThrow(/empty/);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("accepts a file of exactly the bucket cap and refuses one byte more", async () => {
    const cap = 5 * 1024 * 1024; // npc-portraits: five megabytes
    expect(await uploadToBucket({ bucket: "npcPortraits", blob: webp(cap), userId: "u1" })).not.toBeNull();
    await expect(uploadToBucket({ bucket: "npcPortraits", blob: webp(cap + 1), userId: "u1" })).rejects.toThrow(/max 5 MB/);
  });

  it("refuses a type the bucket does not take", async () => {
    const png = new Blob([new Uint8Array(4)], { type: "image/png" });
    await expect(uploadToBucket({ bucket: "npcPortraits", blob: png, userId: "u1" })).rejects.toThrow(/not allowed/);
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("returns null and registers no provenance when storage refuses the object", async () => {
    storageUpload.mockResolvedValue({ data: null, error: { message: "denied" } });
    const marked = embedXmpInWebp(
      buildMinimalWebp(),
      buildXmpPacket({ generatorType: "npc-portrait", provider: "openai", model: "m", generatedAt: "2026-10-02T10:00:00.000Z", edited: false }),
    );
    const blob = new Blob([toBlobPart(marked)], { type: "image/webp" });
    expect(await uploadToBucket({ bucket: "npcPortraits", blob, userId: "u1" })).toBeNull();
    expect(registerImageProvenance).not.toHaveBeenCalled();
  });

  it("uploadWithVariants returns null and stores no variants when the original is refused", async () => {
    storageUpload.mockResolvedValue({ data: null, error: { message: "denied" } });
    expect(await uploadWithVariants({ bucket: "npcPortraits", blob: webp(8), userId: "u1" })).toBeNull();
    expect(storageUpload).toHaveBeenCalledTimes(1);
  });

  it("files canonical art under the given prefix and not under the uploader's folder (Storage Path Convention)", async () => {
    const url = await uploadWithVariants({ bucket: "monsterImages", blob: webp(8), userId: "admin-1", folderPrefix: "srd" });
    expect(url).toContain("/monster-images/srd/");
    expect(storageUpload.mock.calls.map(([path]) => path).every((path) => path.startsWith("srd/"))).toBe(true);
  });

  it("files a jpeg under .jpeg but its variants as webp", async () => {
    const jpeg = new Blob([new Uint8Array(8)], { type: "image/jpeg" });
    const url = await uploadWithVariants({ bucket: "npcPortraits", blob: jpeg, userId: "u1" });
    expect(url).toMatch(/\.jpeg$/);
    const paths = storageUpload.mock.calls.map(([path]) => path);
    expect(paths.filter((path) => path.endsWith("_w400.webp"))).toHaveLength(1);
  });

  it("stores every variant as a plain insert of image/webp, never an upsert (some buckets have no UPDATE policy)", async () => {
    await uploadWithVariants({ bucket: "npcPortraits", blob: webp(8), userId: "u1" });
    expect(storageUpload.mock.calls).toHaveLength(5);
    for (const [, , options] of storageUpload.mock.calls) expect(options.upsert).toBe(false);
    const variantOptions = storageUpload.mock.calls.filter(([path]) => /_w\d+\./.test(path)).map(([, , options]) => options);
    expect(variantOptions.every((o) => o.contentType === "image/webp")).toBe(true);
  });

  describe("when the bucket is R2-backed", () => {
    const refused = new Error("403 from the signer");

    beforeEach(() => {
      r2.on = true;
    });

    it.each([
      ["uploadToBucket", () => uploadToBucket({ bucket: "npcPortraits", blob: webp(8), userId: "u1" })],
      ["uploadWithVariants", () => uploadWithVariants({ bucket: "npcPortraits", blob: webp(8), userId: "u1" })],
    ])("%s returns null on a refusal without retrying in Supabase", async (_name, run) => {
      r2.uploadToR2 = async () => {
        throw refused;
      };
      expect(await run()).toBeNull();
      expect(storageUpload).not.toHaveBeenCalled();
    });

    it.each([
      ["uploadToBucket", () => uploadToBucket({ bucket: "npcPortraits", blob: webp(8), userId: "u1" })],
      ["uploadWithVariants", () => uploadWithVariants({ bucket: "npcPortraits", blob: webp(8), userId: "u1" })],
    ])("%s falls back to Supabase when R2 is unavailable", async (_name, run) => {
      const { R2UnavailableError } = await import("./r2");
      r2.uploadToR2 = async () => {
        throw new R2UnavailableError("not provisioned");
      };
      expect(await run()).toContain("/npc-portraits/u1/");
      expect(storageUpload).toHaveBeenCalled();
    });
  });
});

describe("backfillVariants", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let n = 0;
  /** A fresh URL per test: backfillVariants remembers what it has tried this session. */
  const owned = (suffix = "") => IMAGE_BUCKET_URL(`session-user/${++n}${suffix}.webp`);

  beforeEach(() => {
    storageUpload.mockClear();
    storageUpload.mockResolvedValue({ data: null, error: null });
    session.user = { id: "session-user", app_metadata: {} };
    r2.on = false;
    fetchMock = vi.fn(async () => new Response(new Uint8Array(buildMinimalWebp()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("uploads the four missing variants of the caller's own image", async () => {
    await backfillVariants(owned());
    expect(storageUpload).toHaveBeenCalledTimes(4);
  });

  it.each([
    ["signed out", () => { session.user = null; }, owned],
    ["someone else's folder", () => undefined, () => IMAGE_BUCKET_URL(`other-user/${++n}.webp`)],
    ["a URL that is already a variant", () => undefined, () => owned("_w200")],
    ["a bucket of audio", () => undefined, () => `https://cdn.example.com/sounds/session-user/${++n}.ogg`],
    ["a URL in no bucket", () => undefined, () => `https://elsewhere.example.com/${++n}.webp`],
  ])("does nothing for %s", async (_label, arrange, makeUrl) => {
    arrange();
    await backfillVariants(makeUrl());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("tries a URL once per session", async () => {
    const url = owned();
    await backfillVariants(url);
    await backfillVariants(url);
    expect(storageUpload).toHaveBeenCalledTimes(4);
  });

  it("uploads nothing when the original cannot be fetched", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await backfillVariants(owned());
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("lets an admin heal the shared srd/ prefix", async () => {
    session.user = { id: "admin-1", app_metadata: { role: "admin" } };
    await backfillVariants(`https://cdn.example.com/monster-images/srd/${++n}.webp`);
    expect(storageUpload).toHaveBeenCalledTimes(4);
  });

  it("does not let an ordinary user write the shared srd/ prefix", async () => {
    await backfillVariants(`https://cdn.example.com/monster-images/srd/${++n}.webp`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("healVariants", () => {
  it("throws when the original it was asked to heal cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    await expect(healVariants("npcPortraits", "u1/gone.webp")).rejects.toThrow(/could not fetch original/);
  });

  it("reports how many variant uploads failed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    storageUpload.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    const original = new Blob([buildMinimalWebp()], { type: "image/webp" });
    expect(await healVariants("npcPortraits", "u1/a.webp", original)).toEqual({ total: 4, failed: 1 });
  });

  it("inserts the variants without upserting, since some buckets have no UPDATE policy", async () => {
    storageUpload.mockClear();
    const original = new Blob([buildMinimalWebp()], { type: "image/webp" });
    await healVariants("npcPortraits", "u1/a.webp", original);
    expect(storageUpload).toHaveBeenCalledTimes(4);
    for (const [, , options] of storageUpload.mock.calls) expect(options.upsert).toBe(false);
  });
});
