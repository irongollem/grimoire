import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { embedXmpInPng, embedXmpInWebp } from "../supabase/functions/_shared/provenance/embed.ts";
import { sniffImageFormat } from "../supabase/functions/_shared/provenance/sniff.ts";
import type { AiProvenance } from "../supabase/functions/_shared/provenance/types.ts";
import { buildXmpPacket } from "../supabase/functions/_shared/provenance/xmp.ts";
import { readProvenanceFromBytes } from "./backfill-image-provenance";
import {
  assertMayWrite,
  buildMoveVariants,
  buildNewOriginal,
  collectJobs,
  decideEncode,
  fileStem,
  parseCli,
  qualify,
  selectJobs,
  selectRowsByExactUrl,
  variantPaths,
  type Qualified,
} from "./move-library-art-to-srd";

const ADMIN = "fc8ae595-641f-4127-87ad-03588f3710d1";
const ORIGIN = "https://abc.supabase.co/storage/v1/object/public";
const PROV: AiProvenance = {
  generatorType: "item",
  provider: "openai",
  model: "gpt-image-1",
  generatedAt: "2026-08-04T12:00:00.000Z",
  edited: false,
};

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } }).png().toBuffer());
}
async function webp(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 20, g: 90, b: 200 } } }).webp().toBuffer());
}
async function jpeg(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 20, g: 200, b: 90 } } }).jpeg().toBuffer());
}
function marked(bytes: Uint8Array): Uint8Array {
  return embedXmpInWebp(bytes, buildXmpPacket(PROV));
}

describe("qualify", () => {
  it("sends an item in a user folder to item-images/srd as WebP", () => {
    const q = qualify(`${ORIGIN}/asset-images/${ADMIN}/abc.png`, "item") as Qualified;
    expect(q.bucket).toBe("asset-images");
    expect(q.stem).toBe("abc");
    expect(q.extension).toBe("png");
    expect(q.targetBucket).toBe("item-images");
    expect(q.targetPath).toBe("srd/abc.webp");
  });

  it("sends a monster to monster-images/srd", () => {
    const q = qualify(`https://cdn.example.com/monster-images/${ADMIN}/m.webp`, "monster") as Qualified;
    expect(q.targetBucket).toBe("monster-images");
    expect(q.targetPath).toBe("srd/m.webp");
  });

  it("skips what is already under srd/", () => {
    expect(qualify(`${ORIGIN}/item-images/srd/abc.webp`, "item")).toEqual({ skip: "already-srd" });
  });

  it("skips a first segment that is not a uuid, an unregistered bucket and a variant", () => {
    expect(qualify(`${ORIGIN}/item-images/shared/abc.webp`, "item")).toEqual({ skip: "not-user-folder" });
    expect(qualify(`${ORIGIN}/not-a-bucket/${ADMIN}/abc.webp`, "item")).toEqual({ skip: "unregistered-bucket" });
    expect(qualify(`${ORIGIN}/item-images/${ADMIN}/abc_w400.webp`, "item")).toEqual({ skip: "variant" });
  });
});

describe("fileStem", () => {
  it("splits the last segment", () => {
    expect(fileStem(`${ADMIN}/a.b.png`)).toEqual({ stem: "a.b", extension: "png" });
    expect(fileStem("noext")).toEqual({ stem: "noext", extension: "" });
  });
});

describe("collectJobs and selectJobs", () => {
  const rows = [
    { url: `${ORIGIN}/asset-images/${ADMIN}/a.png`, kind: "item" as const, source: "library_art_defaults.image_url" },
    { url: `${ORIGIN}/item-images/${ADMIN}/a.webp`, kind: "item" as const, source: "library_art_defaults.image_url" },
    { url: `${ORIGIN}/monster-images/${ADMIN}/m.webp`, kind: "monster" as const, source: "library_monster_art_canonical.image_url" },
    { url: `${ORIGIN}/item-images/srd/done.webp`, kind: "item" as const, source: "library_art_defaults.image_url" },
    { url: "https://example.com/x.png", kind: "item" as const, source: "library_art_defaults.image_url" },
  ];

  it("groups old URLs of one stem, counts moved and ignored rows", () => {
    const { jobs, alreadyMoved, ignored } = collectJobs(rows);
    expect(jobs).toHaveLength(2);
    expect(jobs[0].oldUrls).toHaveLength(2);
    expect(jobs[0].targetPath).toBe("srd/a.webp");
    expect(alreadyMoved).toBe(1);
    expect(ignored).toBe(1);
  });

  it("narrows by --only and --limit, and refuses an --only that names nothing", () => {
    const { jobs } = collectJobs(rows);
    expect(selectJobs(jobs, { only: "m", limit: null })).toHaveLength(1);
    expect(selectJobs(jobs, { only: null, limit: 1 })).toHaveLength(1);
    expect(() => selectJobs(jobs, { only: "nope", limit: null })).toThrow(/--only nope/);
  });
});

describe("decideEncode", () => {
  it("copies real WebP and re-encodes everything else", async () => {
    expect(decideEncode(await webp(4, 4), "webp").action).toBe("copy");
    expect(decideEncode(await png(4, 4), "png").action).toBe("reencode");
    const jpegUnderWebp = decideEncode(await jpeg(4, 4), "webp");
    expect(jpegUnderWebp.action).toBe("reencode");
    expect(jpegUnderWebp.reason).toMatch(/\.webp name/);
    expect(decideEncode(new Uint8Array([1, 2, 3]), "gif").action).toBe("reencode");
  });
});

describe("variantPaths and selectRowsByExactUrl", () => {
  it("names the four variants", () => {
    expect(variantPaths("srd/a.webp")).toEqual(["srd/a_w200.webp", "srd/a_w300.webp", "srd/a_w400.webp", "srd/a_w600.webp"]);
  });

  it("matches the exact URL only", () => {
    const rows = [{ url: "https://x/a.webp" }, { url: "https://x/a.webp?v=2" }, { url: "https://x/a.webp.bak" }, { url: "https://x/b.webp" }];
    expect(selectRowsByExactUrl(rows, ["https://x/a.webp"])).toEqual([{ url: "https://x/a.webp" }]);
  });
});

describe("parseCli and assertMayWrite", () => {
  it("defaults to a dry run", () => {
    expect(parseCli([])).toEqual({ write: false, yesProduction: false, limit: null, only: null, out: null, libraryOwner: null, cdnBase: null });
  });

  it("reads every option", () => {
    const opts = parseCli(["--write", "--yes-production", "--limit", "3", "--only", "abc", "--out", "p.json", "--library-owner", ADMIN.toUpperCase(), "--cdn-base", "https://cdn.x/"]);
    expect(opts).toMatchObject({ write: true, yesProduction: true, limit: 3, only: "abc", out: "p.json", libraryOwner: ADMIN, cdnBase: "https://cdn.x/" });
  });

  it("refuses a bad limit, a bad owner and an unknown flag", () => {
    expect(() => parseCli(["--limit", "0"])).toThrow(/positive integer/);
    expect(() => parseCli(["--limit", "x"])).toThrow(/positive integer/);
    expect(() => parseCli(["--library-owner", "nope"])).toThrow(/uuid/);
    expect(() => parseCli(["--delete"])).toThrow();
  });

  it("refuses a production write without --yes-production, allows a dry run and loopback", () => {
    expect(() => assertMayWrite({ write: true, yesProduction: false }, "https://abc.supabase.co")).toThrow(/--yes-production/);
    expect(() => assertMayWrite({ write: true, yesProduction: true }, "https://abc.supabase.co")).not.toThrow();
    expect(() => assertMayWrite({ write: false, yesProduction: false }, "https://abc.supabase.co")).not.toThrow();
    expect(() => assertMayWrite({ write: true, yesProduction: false }, "http://127.0.0.1:54321")).not.toThrow();
  });
});

describe("encode round trip", () => {
  it("copies a marked WebP byte for byte, and keeps the mark through the variants", async () => {
    const old = marked(await webp(900, 1200));
    const out = await buildNewOriginal(old, "webp");
    expect(out.decision.action).toBe("copy");
    expect(Buffer.from(out.bytes).equals(Buffer.from(old))).toBe(true);
    expect(out.provenance).toEqual(PROV);

    const variants = await buildMoveVariants(out.bytes, "srd/a.webp", out.provenance);
    expect(variants.map((v) => v.path)).toEqual(variantPaths("srd/a.webp"));
    for (const v of variants) {
      expect(sniffImageFormat(v.bytes)).toBe("image/webp");
      expect(readProvenanceFromBytes(v.bytes)).toEqual(PROV);
    }
  });

  it("re-encodes a PNG to WebP, unmarked stays unmarked and variants are never upscaled", async () => {
    const out = await buildNewOriginal(await png(300, 450), "png");
    expect(out.decision.action).toBe("reencode");
    expect(sniffImageFormat(out.bytes)).toBe("image/webp");
    expect(out.provenance).toBeNull();
    expect(readProvenanceFromBytes(out.bytes)).toBeNull();

    const variants = await buildMoveVariants(out.bytes, "srd/a.webp", out.provenance);
    for (const v of variants) {
      expect(readProvenanceFromBytes(v.bytes)).toBeNull();
      const meta = await sharp(v.bytes).metadata();
      expect(meta.width).toBeLessThanOrEqual(Math.min(300, v.width));
    }
    const w600 = variants.find((v) => v.width === 600);
    expect((await sharp((w600 as { bytes: Uint8Array }).bytes).metadata()).width).toBe(300);
  });

  it("re-encodes JPEG bytes under a .webp name to real WebP", async () => {
    const out = await buildNewOriginal(await jpeg(64, 64), "webp");
    expect(out.decision.action).toBe("reencode");
    expect(sniffImageFormat(out.bytes)).toBe("image/webp");
  });

  it("carries the mark through a re-encode of a marked PNG original", async () => {
    const markedPng = embedXmpInPng(await png(64, 64), buildXmpPacket(PROV));
    const out = await buildNewOriginal(markedPng, "png");
    expect(sniffImageFormat(out.bytes)).toBe("image/webp");
    expect(readProvenanceFromBytes(out.bytes)).toEqual(PROV);
  });
});
