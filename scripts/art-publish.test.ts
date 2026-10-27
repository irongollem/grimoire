import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { publish, contentTypeFor, parseArgs, resolveSourceFile, type PublishDeps } from "./art-publish";
import { IMMUTABLE_CACHE_CONTROL, type R2Config } from "../supabase/functions/_shared/r2/config.ts";

const md5 = (bytes: Buffer) => createHash("md5").update(bytes).digest("hex");

const R2: R2Config = {
  accountId: "acc",
  bucket: "grimoire-assets",
  accessKeyId: "key",
  secretAccessKey: "secret",
  endpoint: "https://acc.r2.cloudflarestorage.com",
};

const ENTRY: [string, string] = ["/assets/placeholders/npc.webp", "app-art/assets/placeholders/npc.abc12345.webp"];

function makeDeps(overrides: Partial<PublishDeps> = {}): PublishDeps {
  return {
    putObject: vi.fn(async () => undefined),
    headObject: vi.fn(async () => null),
    getObject: vi.fn(async () => null),
    readFile: vi.fn(() => Buffer.from("fake-bytes")),
    resolveSourceFile: vi.fn((servedPath: string) => `/repo/public${servedPath}`),
    ...overrides,
  };
}

describe("art-publish publish()", () => {
  it("skips an object that already exists at the same size (HEAD hit)", async () => {
    const deps = makeDeps({
      headObject: vi.fn(async () => ({ size: Buffer.from("fake-bytes").byteLength, etag: null, lastModified: null })),
    });

    const result = await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 0, skipped: 1, problems: [] });
  });

  it("uploads an object that does not exist in R2", async () => {
    const deps = makeDeps();

    const result = await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).toHaveBeenCalledOnce();
    expect(result).toEqual({ uploaded: 1, skipped: 0, problems: [] });
  });

  it("--dry-run reports what it would upload without writing anything", async () => {
    const deps = makeDeps();

    const result = await publish([ENTRY], R2, { dryRun: true, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 1, skipped: 0, problems: [] });
  });

  it("uploads with the immutable cache-control header", async () => {
    const deps = makeDeps();

    await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).toHaveBeenCalledWith(
      R2,
      expect.objectContaining({
        key: ENTRY[1],
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      }),
    );
  });

  it("--verify reports a missing object without uploading it", async () => {
    const deps = makeDeps();

    const result = await publish([ENTRY], R2, { dryRun: false, verify: true, concurrency: 4 }, deps);

    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result.problems).toEqual([`missing from r2: ${ENTRY[1]}`]);
  });
});

// A matching ETag is content-identity proof; a matching size alone is not — a
// stale/corrupted object in R2 can happen to share the local file's byte
// length. See `matchesStored`'s docstring.
describe("art-publish matchesStored via publish() — ETag", () => {
  const BYTES = Buffer.from("fake-bytes");

  it("skips when the ETag matches, without reading the object", async () => {
    const deps = makeDeps({
      readFile: vi.fn(() => BYTES),
      headObject: vi.fn(async () => ({ size: BYTES.byteLength, etag: md5(BYTES), lastModified: null })),
    });

    const result = await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.getObject).not.toHaveBeenCalled();
    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 0, skipped: 1, problems: [] });
  });

  it("does NOT skip on a size match alone when the ETag mismatches — the bug this fixes", async () => {
    const deps = makeDeps({
      readFile: vi.fn(() => BYTES),
      // Same byte length as BYTES, but a different ETag: a stale or corrupted
      // object the old size-only check would have wrongly called "stored".
      headObject: vi.fn(async () => ({ size: BYTES.byteLength, etag: md5(Buffer.from("wrong-byte")), lastModified: null })),
    });

    const result = await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).toHaveBeenCalledOnce();
    expect(result).toEqual({ uploaded: 1, skipped: 0, problems: [] });
  });

  it("falls back to size comparison when the ETag is absent — previous behaviour", async () => {
    const deps = makeDeps({
      readFile: vi.fn(() => BYTES),
      headObject: vi.fn(async () => ({ size: BYTES.byteLength, etag: null, lastModified: null })),
    });

    const result = await publish([ENTRY], R2, { dryRun: false, verify: false, concurrency: 4 }, deps);

    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 0, skipped: 1, problems: [] });
  });
});

describe("contentTypeFor", () => {
  it("maps known art extensions to their MIME type", () => {
    expect(contentTypeFor("npc.webp")).toBe("image/webp");
    expect(contentTypeFor("icon.PNG")).toBe("image/png");
  });

  it("falls back to octet-stream for an unknown extension", () => {
    expect(contentTypeFor("mystery.bin")).toBe("application/octet-stream");
  });
});

// R2's HEAD carries no `content-length` for a text content type — the response
// is compressed in transit, so it is chunked. Every `.svg` in the manifest is
// in that case. Before this was handled, `--verify` reported all 23 as "size
// mismatch … r2 unknown" on the first real publish (14 Sep 2026) when every one
// was byte-identical, and the skip-if-present resume re-uploaded them every run.
describe("art-publish when R2 reports no size", () => {
  const BYTES = Buffer.from("<svg/>");
  const SVG: [string, string] = ["/assets/vision/darkvision.svg", "app-art/assets/vision/darkvision.a92d9123.svg"];

  function svgDeps(remote: Uint8Array | null, verify: boolean) {
    return {
      deps: makeDeps({
        readFile: vi.fn(() => BYTES),
        headObject: vi.fn(async () => ({ size: null, etag: null, lastModified: null })),
        getObject: vi.fn(async () => remote),
      }),
      options: { dryRun: false, verify, concurrency: 4 },
    };
  }

  it("settles an unknown size by comparing bytes, and skips a match", async () => {
    const { deps, options } = svgDeps(new Uint8Array(BYTES), false);

    const result = await publish([SVG], R2, options, deps);

    expect(deps.getObject).toHaveBeenCalledWith(R2, SVG[1]);
    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result).toEqual({ uploaded: 0, skipped: 1, problems: [] });
  });

  it("reports nothing wrong on verify when the bytes match", async () => {
    const { deps, options } = svgDeps(new Uint8Array(BYTES), true);

    const result = await publish([SVG], R2, options, deps);

    expect(result.problems).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it("still catches genuinely different content rather than trusting the unknown", async () => {
    const { deps, options } = svgDeps(new Uint8Array(Buffer.from("<svg>different</svg>")), true);

    const result = await publish([SVG], R2, options, deps);

    expect(result.skipped).toBe(0);
    expect(result.problems).toEqual([`content differs ${SVG[1]}: local ${BYTES.byteLength} bytes`]);
  });

  it("re-uploads when the object turns out not to be readable at all", async () => {
    const { deps, options } = svgDeps(null, false);

    const result = await publish([SVG], R2, options, deps);

    expect(deps.putObject).toHaveBeenCalled();
    expect(result.uploaded).toBe(1);
  });
});


describe("art-publish upload details", () => {
  const options = { dryRun: false, verify: false, concurrency: 4 };

  it("uploads the file's own bytes under the manifest's key with the content type its extension names", async () => {
    const SVG: [string, string] = ["/assets/vision/darkvision.svg", "app-art/assets/vision/darkvision.a92d9123.svg"];
    const deps = makeDeps({ readFile: vi.fn(() => Buffer.from("<svg/>")) });
    await publish([SVG], R2, options, deps);
    const [, put] = vi.mocked(deps.putObject).mock.calls[0];
    expect(put.key).toBe(SVG[1]);
    expect(put.contentType).toBe("image/svg+xml");
    expect(Buffer.from(put.body).toString()).toBe("<svg/>");
  });

  it("overwrites an object whose content differs, outside verify", async () => {
    const deps = makeDeps({ headObject: vi.fn(async () => ({ size: 3, etag: null, lastModified: null })) });
    const result = await publish([ENTRY], R2, options, deps);
    expect(deps.putObject).toHaveBeenCalledOnce();
    expect(result).toEqual({ uploaded: 1, skipped: 0, problems: [] });
  });

  it("--verify reports a size mismatch as different content and writes nothing", async () => {
    const deps = makeDeps({ headObject: vi.fn(async () => ({ size: 3, etag: null, lastModified: null })) });
    const result = await publish([ENTRY], R2, { ...options, verify: true }, deps);
    expect(deps.putObject).not.toHaveBeenCalled();
    expect(result.problems).toEqual([`content differs ${ENTRY[1]}: local 10 bytes`]);
  });

  it("turns a failed upload into a problem and carries on with the rest of the manifest", async () => {
    const other: [string, string] = ["/assets/b.webp", "app-art/assets/b.00000000.webp"];
    const deps = makeDeps({
      putObject: vi.fn(async (_r2, put) => {
        if (put.key === ENTRY[1]) throw new Error("R2 said no");
      }),
    });
    const result = await publish([ENTRY, other], R2, options, deps);
    expect(result.uploaded).toBe(1);
    expect(result.problems).toEqual([`upload failed ${ENTRY[1]}: R2 said no`]);
  });

  it("turns a failing HEAD or a missing source file into a problem, not a crash", async () => {
    const deps = makeDeps({ headObject: vi.fn(async () => { throw new Error("flaked"); }) });
    const result = await publish([ENTRY], R2, options, deps);
    expect(result.problems).toEqual([`unexpected failure ${ENTRY[0]}: flaked`]);
    expect(deps.putObject).not.toHaveBeenCalled();
  });
});

describe("parseArgs", () => {
  it("reads the flags, and defaults to eight at a time", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, verify: false, concurrency: 8 });
    expect(parseArgs(["--dry-run", "--verify", "--concurrency", "3"])).toEqual({ dryRun: true, verify: true, concurrency: 3 });
  });
});

describe("resolveSourceFile", () => {
  it("prefers public/, falls back to src/, and says so when neither has the file", () => {
    const root = mkdtempSync(join(tmpdir(), "art-publish-"));
    try {
      mkdirSync(join(root, "public/assets"), { recursive: true });
      mkdirSync(join(root, "src/assets/sheets"), { recursive: true });
      writeFileSync(join(root, "public/assets/a.webp"), "p");
      writeFileSync(join(root, "src/assets/a.webp"), "s");
      writeFileSync(join(root, "src/assets/sheets/plate.webp"), "s");
      expect(resolveSourceFile("/assets/a.webp", root)).toBe(join(root, "public/assets/a.webp"));
      expect(resolveSourceFile("/assets/sheets/plate.webp", root)).toBe(join(root, "src/assets/sheets/plate.webp"));
      expect(() => resolveSourceFile("/assets/gone.webp", root)).toThrow(/no source file on disk/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
