import { describe, expect, it } from "vitest";
import {
  candidateUrls,
  categorizeUnreadable,
  deadExitCode,
  deadReportLines,
  otherReferencedOriginals,
  survivorVariantUrl,
  type Unreadable,
  collectTargets,
  IMAGE_COLUMNS,
  isLoopbackUrl,
  isVariantPath,
  parseImageUrl,
  planEntry,
  readProvenanceFromBytes,
  resolveOwner,
  toRegistryRow,
  type RegisteredRow,
  type Target,
} from "./backfill-image-provenance";
import { embedProvenance } from "../supabase/functions/_shared/provenance/embed.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const ADMIN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER = "99999999-8888-4777-8666-555555555555";
const ORIGIN = "https://abc.supabase.co/storage/v1/object/public";

const PROV: AiProvenance = {
  generatorType: "npc",
  provider: "openai",
  model: "gpt-image-1",
  generatedAt: "2026-08-04T12:00:00.000Z",
  edited: false,
};

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}
function u32le(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}
/** A minimal lossy WebP: RIFF header plus one VP8 chunk, enough for the XMP embedder. */
function minimalWebp(): Uint8Array {
  const vp8 = [0x10, 0x01, 0x00, 0x9d, 0x01, 0x2a, 1, 0, 1, 0];
  const chunk = [...ascii("VP8 "), ...u32le(vp8.length), ...vp8];
  const payload = [...ascii("WEBP"), ...chunk];
  return new Uint8Array([...ascii("RIFF"), ...u32le(payload.length), ...payload]);
}

describe("parseImageUrl", () => {
  it("reads the origin shape", () => {
    expect(parseImageUrl(`${ORIGIN}/npc-portraits/${USER}/a.webp`)).toEqual({ bucket: "npc-portraits", path: `${USER}/a.webp` });
  });

  it("reads the CDN shape and ignores the query string", () => {
    expect(parseImageUrl(`https://cdn.example.com/monster-images/srd/x.webp?v=2`)).toEqual({ bucket: "monster-images", path: "srd/x.webp" });
  });

  it("decodes percent-encoded paths", () => {
    expect(parseImageUrl(`${ORIGIN}/item-images/${USER}/a%20b.webp`)?.path).toBe(`${USER}/a b.webp`);
  });

  it("returns null outside the image buckets, for audio buckets, blobs and empty strings", () => {
    expect(parseImageUrl("https://example.com/elsewhere/a.webp")).toBeNull();
    expect(parseImageUrl(`${ORIGIN}/sounds/${USER}/a.mp3`)).toBeNull();
    expect(parseImageUrl("blob:https://app/abc")).toBeNull();
    expect(parseImageUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(parseImageUrl("")).toBeNull();
  });
});

describe("isVariantPath", () => {
  it("flags size variants only", () => {
    expect(isVariantPath("u/abc_w400.webp")).toBe(true);
    expect(isVariantPath("u/abc.webp")).toBe(false);
    expect(isVariantPath("u/new_wizard.webp")).toBe(false);
  });
});

describe("resolveOwner", () => {
  it("prefers the uuid folder over the row owner", () => {
    expect(resolveOwner(`${USER}/a.webp`, OTHER)).toBe(USER);
  });

  it("falls back to the row owner for a non-uuid folder", () => {
    expect(resolveOwner("misc/a.webp", OTHER)).toBe(OTHER);
  });

  it("is null when neither is known", () => {
    expect(resolveOwner("srd/a.webp", null)).toBeNull();
  });

  it("gives an srd path to the library owner, even when the row has an owner", () => {
    expect(resolveOwner("srd/a.webp", null, ADMIN)).toBe(ADMIN);
    expect(resolveOwner("srd/a.webp", OTHER, ADMIN)).toBe(ADMIN);
  });

  it("leaves an srd path ownerless without a library owner", () => {
    expect(resolveOwner("srd/a.webp", OTHER, null)).toBeNull();
  });

  it("leaves a uuid path alone and uses the library owner only for ownerless non-uuid rows", () => {
    expect(resolveOwner(`${USER}/a.webp`, null, ADMIN)).toBe(USER);
    expect(resolveOwner("misc/a.webp", OTHER, ADMIN)).toBe(OTHER);
    expect(resolveOwner("misc/a.webp", null, ADMIN)).toBe(ADMIN);
  });
});

describe("collectTargets", () => {
  it("collapses a variant, an original and a duplicate to one target", () => {
    const { targets, ignored } = collectTargets([
      { url: `${ORIGIN}/npc-portraits/${USER}/a_w400.webp`, userId: USER, source: "npcs.portrait_url" },
      { url: `${ORIGIN}/npc-portraits/${USER}/a.webp`, userId: USER, source: "npcs.cutout_url" },
      { url: `${ORIGIN}/npc-portraits/${USER}/a.webp`, userId: USER, source: "npcs.cutout_url" },
      { url: "https://example.com/x.png", userId: USER, source: "npcs.portrait_url" },
    ]);
    expect(ignored).toBe(1);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      bucket: "npc-portraits",
      stem: `${USER}/a`,
      originalPaths: [`${USER}/a.webp`],
      owner: USER,
      sources: ["npcs.portrait_url", "npcs.cutout_url"],
    });
  });

  it("keeps the same stem in two buckets apart and takes a later row's owner", () => {
    const { targets } = collectTargets([
      { url: `${ORIGIN}/library-tile-packs/srd/a.webp`, userId: null, source: "x.image_url" },
      { url: `${ORIGIN}/monster-images/misc/a.webp`, userId: null, source: "y.image_url" },
      { url: `${ORIGIN}/monster-images/misc/a_w400.webp`, userId: OTHER, source: "z.image_url" },
    ]);
    expect(targets).toHaveLength(2);
    expect(targets.find((t) => t.bucket === "monster-images")?.owner).toBe(OTHER);
  });
});

describe("candidateUrls", () => {
  it("tries known originals first, then each extension, rebuilt next to the stored URL", () => {
    const { targets } = collectTargets([{ url: `${ORIGIN}/npc-portraits/${USER}/a_w400.webp`, userId: USER, source: "s" }]);
    expect(candidateUrls(targets[0])).toEqual([
      `${ORIGIN}/npc-portraits/${USER}/a.webp`,
      `${ORIGIN}/npc-portraits/${USER}/a.jpeg`,
      `${ORIGIN}/npc-portraits/${USER}/a.png`,
    ]);
  });

  it("rebuilds CDN-shaped URLs and does not repeat a known original", () => {
    const { targets } = collectTargets([{ url: "https://cdn.example.com/item-images/srd/a.jpeg", userId: null, source: "s" }]);
    const urls = candidateUrls(targets[0]);
    expect(urls[0]).toBe("https://cdn.example.com/item-images/srd/a.jpeg");
    expect(urls).toHaveLength(3);
    expect(new Set(urls).size).toBe(3);
  });
});

describe("planEntry", () => {
  const target: Pick<Target, "bucket" | "stem" | "owner"> = { bucket: "npc-portraits", stem: `${USER}/a`, owner: USER };
  const registered = (provenance: AiProvenance, user_id = OTHER): RegisteredRow => ({ bucket: "npc-portraits", stem: `${USER}/a`, user_id, provenance });

  it("inserts when nothing is registered", () => {
    expect(planEntry(target, PROV, null)).toMatchObject({ verdict: "insert", user_id: USER, previous: null });
  });

  it("skips a registered row that already equals the packet", () => {
    expect(planEntry(target, PROV, registered({ ...PROV }))).toMatchObject({ verdict: "skip" });
  });

  it("corrects a job-derived row, keeping the registered owner", () => {
    const entry = planEntry(target, PROV, registered({ ...PROV, provider: "google" }));
    expect(entry).toMatchObject({ verdict: "correct", user_id: OTHER });
    expect(entry.provenance.provider).toBe("openai");
  });

  it("never reverts edited to false", () => {
    const entry = planEntry(target, PROV, registered({ ...PROV, edited: true }));
    expect(entry.verdict).toBe("skip");
    const corrected = planEntry(target, PROV, registered({ ...PROV, provider: "google", edited: true }));
    expect(corrected.verdict).toBe("correct");
    expect(corrected.provenance.edited).toBe(true);
  });

  it("flags an unregistered image with no owner instead of inserting it", () => {
    expect(planEntry({ ...target, owner: null }, PROV, null)).toMatchObject({ verdict: "no-owner", user_id: null });
  });
});

describe("toRegistryRow", () => {
  it("refuses an entry with no owner", () => {
    const entry = planEntry({ bucket: "b", stem: "s", owner: null }, PROV, null);
    expect(() => toRegistryRow(entry)).toThrow(/No owner/);
  });

  it("projects the upsert row", () => {
    const entry = planEntry({ bucket: "b", stem: "s", owner: USER }, PROV, null);
    expect(toRegistryRow(entry)).toEqual({ bucket: "b", stem: "s", user_id: USER, provenance: PROV });
  });
});

describe("readProvenanceFromBytes", () => {
  it("reads the packet back out of a marked WebP", () => {
    const marked = embedProvenance(minimalWebp(), "image/webp", PROV);
    expect(readProvenanceFromBytes(marked)).toEqual(PROV);
  });

  it("is null for an unmarked image and for non-image bytes", () => {
    expect(readProvenanceFromBytes(minimalWebp())).toBeNull();
    expect(readProvenanceFromBytes(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("isLoopbackUrl", () => {
  it("separates the local stack from a hosted project", () => {
    expect(isLoopbackUrl("http://127.0.0.1:54321")).toBe(true);
    expect(isLoopbackUrl("http://localhost:54321")).toBe(true);
    expect(isLoopbackUrl("https://abc.supabase.co")).toBe(false);
  });
});

describe("IMAGE_COLUMNS", () => {
  it("lists each column once", () => {
    const keys = IMAGE_COLUMNS.map((c) => `${c.table}.${c.column}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("dead image reporting (#952)", () => {
  const target: Target = {
    bucket: "item-images",
    stem: `${USER}/abc`,
    originalPaths: [`${USER}/abc.webp`],
    urlPrefix: `${ORIGIN}/item-images/`,
    owner: USER,
    sources: ["library_art_defaults.image_url"],
  };
  const dead: Unreadable = { bucket: "item-images", stem: `${USER}/abc`, reason: "404", sources: ["library_art_defaults.image_url"], survivor: "none", deadPaths: [] };
  const restorable: Unreadable = { bucket: "item-images", stem: `${USER}/def`, reason: "404", sources: ["library_items.image_url", "items.image_url"], survivor: "variant", deadPaths: [] };
  const renamed: Unreadable = { bucket: "asset-images", stem: `${USER}/ghi`, reason: "404", sources: ["library_art_defaults.image_url"], survivor: "sibling", deadPaths: [`${USER}/ghi.png`] };

  it("builds the _w600 variant URL next to the original", () => {
    expect(survivorVariantUrl(target)).toBe(`${ORIGIN}/item-images/${USER}/abc_w600.webp`);
  });

  it("keeps the referencing columns on a collected target", () => {
    const { targets } = collectTargets([{ url: `${ORIGIN}/item-images/${USER}/abc.webp`, userId: null, source: "library_art_defaults.image_url" }]);
    expect(targets[0].sources).toEqual(["library_art_defaults.image_url"]);
  });

  it("separates the fully dead from the two repairable kinds", () => {
    const split = categorizeUnreadable([dead, restorable, renamed]);
    expect(split.fullyDead).toEqual([dead]);
    expect(split.originalMissingVariantSurvives).toEqual([restorable]);
    expect(split.referenceDeadSiblingSurvives).toEqual([renamed]);
  });

  it("checks every file a row points at, not only the one that read", () => {
    const { targets } = collectTargets([
      { url: `${ORIGIN}/asset-images/${USER}/ghi.png`, userId: null, source: "library_art_defaults.image_url" },
      { url: `${ORIGIN}/asset-images/${USER}/ghi.webp`, userId: null, source: "library_art_defaults.image_url" },
      { url: `${ORIGIN}/asset-images/${USER}/ghi_w600.webp`, userId: null, source: "items.image_url" },
    ]);
    expect(targets).toHaveLength(1);
    expect(otherReferencedOriginals(targets[0], `${ORIGIN}/asset-images/${USER}/ghi.webp`)).toEqual([
      { path: `${USER}/ghi.png`, url: `${ORIGIN}/asset-images/${USER}/ghi.png` },
    ]);
  });

  it("has nothing more to check when the one referenced file is the one that read", () => {
    expect(otherReferencedOriginals(target, `${ORIGIN}/item-images/${USER}/abc.webp`)).toEqual([]);
  });

  it("names the dead file, not just the stem, when a sibling survives", () => {
    const text = deadReportLines([renamed]).join("\n");
    expect(text).toContain(`asset-images/${USER}/ghi.png`);
    expect(text).toContain("re-point the row");
  });

  it("names bucket, stem and columns for every unreadable image", () => {
    const text = deadReportLines([dead, restorable]).join("\n");
    expect(text).toContain(`item-images/${USER}/abc`);
    expect(text).toContain("library_art_defaults.image_url");
    expect(text).toContain(`item-images/${USER}/def`);
    expect(text).toContain("library_items.image_url, items.image_url");
    expect(text).toContain("restorable");
  });

  it("exits 1 only with the flag and something unreadable, and counts both categories", () => {
    expect(deadExitCode(true, [dead])).toBe(1);
    expect(deadExitCode(true, [restorable])).toBe(1);
    expect(deadExitCode(true, [renamed])).toBe(1);
    expect(deadExitCode(true, [])).toBe(0);
    expect(deadExitCode(false, [dead, restorable])).toBe(0);
  });
});
