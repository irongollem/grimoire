import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  scanArtFiles,
  buildManifest,
  formatManifest,
  hashBytes,
  type ArtFile,
} from "./art-manifest";
import { ART_PREFIX } from "@/lib/assets/artPrefix";

describe("hashBytes", () => {
  it("is stable for identical bytes", () => {
    const bytes = Buffer.from("some art bytes");
    expect(hashBytes(bytes)).toBe(hashBytes(Buffer.from("some art bytes")));
  });

  it("differs when a single byte changes", () => {
    expect(hashBytes(Buffer.from("some art bytes"))).not.toBe(hashBytes(Buffer.from("some art byteS")));
  });

  it("is 8 lowercase hex characters", () => {
    expect(hashBytes(Buffer.from("x"))).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("scanArtFiles + buildManifest", () => {
  let root: string;
  let publicAssets: string;
  let srcSheets: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "art-manifest-test-"));
    publicAssets = join(root, "public-assets");
    srcSheets = join(root, "src-sheets");
    mkdirSync(join(publicAssets, "placeholders"), { recursive: true });
    mkdirSync(srcSheets, { recursive: true });

    // Deliberately out-of-alphabetical-order writes, to prove sort order comes
    // from the manifest builder and not from filesystem iteration order.
    writeFileSync(join(publicAssets, "zebra.webp"), "zebra bytes");
    writeFileSync(join(publicAssets, "placeholders", "npc.webp"), "npc bytes");
    writeFileSync(join(publicAssets, "alpha.webp"), "alpha bytes");
    writeFileSync(join(publicAssets, ".DS_Store"), "not art");
    writeFileSync(join(publicAssets, "notes.txt"), "not art either");
    writeFileSync(join(srcSheets, "front-classic.webp"), "sheet bytes");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function scan(): ArtFile[] {
    return scanArtFiles([
      { dir: publicAssets, keyPrefix: "/assets" },
      { dir: srcSheets, keyPrefix: "/assets/sheets" },
    ]);
  }

  it("skips dotfiles and non-art extensions", () => {
    const files = scan();
    expect(files.some((f) => f.key.includes("DS_Store"))).toBe(false);
    expect(files.some((f) => f.key.includes("notes.txt"))).toBe(false);
  });

  it("builds manifest keys as build-relative /assets paths for both roots", () => {
    const files = scan();
    const keys = files.map((f) => f.key);
    expect(keys).toContain("/assets/zebra.webp");
    expect(keys).toContain("/assets/placeholders/npc.webp");
    expect(keys).toContain("/assets/sheets/front-classic.webp");
  });

  it("sorts entries by key", () => {
    const { manifest } = buildManifest(scan());
    const keys = Object.keys(manifest);
    expect(keys).toEqual([...keys].sort());
  });

  it("counts files and total bytes covered", () => {
    const { fileCount, totalBytes } = buildManifest(scan());
    expect(fileCount).toBe(4); // zebra, alpha, placeholders/npc, sheets/front-classic
    expect(totalBytes).toBe(
      "zebra bytes".length + "alpha bytes".length + "npc bytes".length + "sheet bytes".length,
    );
  });

  it("hashes each value under ART_PREFIX with the hash inserted before the extension", () => {
    const { manifest } = buildManifest(scan());
    const value = manifest["/assets/placeholders/npc.webp"];
    expect(value).toMatch(new RegExp(`^${ART_PREFIX}/assets/placeholders/npc\\.[0-9a-f]{8}\\.webp$`));
  });

  it("--check passes on a freshly generated manifest and fails when a file changes", () => {
    const before = buildManifest(scan());
    const committed = formatManifest(before.manifest);

    // Freshly regenerating from the same bytes reproduces the committed text exactly.
    expect(formatManifest(buildManifest(scan()).manifest)).toBe(committed);

    // Mutating a file's bytes changes its hash, so the regenerated manifest no
    // longer matches what was "committed" — the failure mode `--check` exists to catch.
    writeFileSync(join(publicAssets, "placeholders", "npc.webp"), "npc bytes v2");
    const after = formatManifest(buildManifest(scan()).manifest);
    expect(after).not.toBe(committed);

    // restore for any later assertions in this suite
    writeFileSync(join(publicAssets, "placeholders", "npc.webp"), "npc bytes");
  });
});

describe("the committed manifest", () => {
  it("matches what scanning the real art trees produces right now", () => {
    const committed = readFileSync(join(import.meta.dirname, "../src/generated/artManifest.json"), "utf8");
    expect(formatManifest(buildManifest(scanArtFiles()).manifest)).toBe(committed);
  });
});
