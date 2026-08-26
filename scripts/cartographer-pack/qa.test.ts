import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { BASE_TILE_SIZE, TILE_PACK_SCHEMA, type TilePackManifest } from "../../src/cartographer/packSchema";
import { seededVariantGrid } from "./qa";
import { defaultArtBible, importJob, initWorkspace, loadWorkspace, rebuildPlan } from "./workspace";
import { generateQa, validateAuthoredPack } from "./qa";

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRepo(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "cartographer-pack-test-"));
  temporaryRoots.push(root);
  return root;
}

function fixtureManifest(assets: TilePackManifest["assets"]): TilePackManifest {
  return {
    pack_id: "fixture",
    name: "Fixture",
    description: "QA fixture",
    pack_version: 1,
    schema_version: TILE_PACK_SCHEMA.version,
    base_tile_size: BASE_TILE_SIZE,
    assets,
  };
}

/** A 128x128 WebP at `url`. `gradient` makes its left and right edges disagree. */
async function writeTile(repoRoot: string, url: string, gradient = false): Promise<void> {
  const file = path.join(repoRoot, "public", "cartographer", "fixture", "v1", url);
  await mkdir(path.dirname(file), { recursive: true });
  const body = gradient
    ? `<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="128" height="128" fill="url(#g)"/>`
    : `<rect width="128" height="128" fill="#4b5563"/>`;
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128">${body}</svg>`))
    .webp({ quality: 90 })
    .toFile(file);
}

it("makes a seeded field without immediate orthogonal repeats when alternatives exist", () => {
  const first = seededVariantGrid(20, 20, 8, "celestial-proof");
  const second = seededVariantGrid(20, 20, 8, "celestial-proof");
  expect(second).toEqual(first);
  for (let y = 0; y < first.length; y++) {
    for (let x = 0; x < first[y]!.length; x++) {
      if (x > 0) expect(first[y]![x]).not.toBe(first[y]![x - 1]);
      if (y > 0) expect(first[y]![x]).not.toBe(first[y - 1]![x]);
    }
  }
});

describe("minimum required pack loop", () => {
  it("normalizes a non-standard themed pack and emits every QA artifact", async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), "cartographer-pack-test-"));
    temporaryRoots.push(repoRoot);
    const workspaceRoot = path.join(repoRoot, "art-src", "cartographer", "candy-palace", "v1");
    const bible = defaultArtBible({
      theme: "A candy palace made from boiled-sugar windows and peppermint masonry.",
      materialNotes: ["peppermint masonry", "boiled-sugar windows"],
      paletteNotes: ["raspberry", "cream", "mint"],
    });
    const state = await initWorkspace({
      repoRoot,
      workspaceRoot,
      packId: "candy-palace",
      name: "Candy Palace",
      theme: bible.pack_local_theme,
      packVersion: 1,
      artBible: bible,
      palette: { floor: [180, 70, 110], solidBlock: [80, 180, 150] },
      now: "2026-08-25T00:00:00.000Z",
    });

    const openDoorTemplate = state.plan.jobs.find((job) => job.id === "doorOpenH:0")!;
    const template = await sharp(path.join(workspaceRoot, openDoorTemplate.paths.template)).raw().toBuffer({ resolveWithObject: true });
    const templatePixel = (x: number, y: number) => template.data[(y * template.info.width + x) * template.info.channels]!;
    expect(templatePixel(450, 430)).toBeGreaterThan(230);
    expect(templatePixel(100, 430)).toBeLessThan(150);

    for (const [index, job] of state.plan.jobs.entries()) {
      const source = path.join(repoRoot, `source-${index}.png`);
      const hue = (index * 31) % 255;
      const color = `rgb(${hue},${(hue + 70) % 255},${(hue + 140) % 255})`;
      const artwork = job.mechanics.footprint === "centered-horizontal-edge"
        ? `<rect width="256" height="256" fill="#fff"/><rect y="105" width="256" height="46" fill="${color}"/>`
        : job.mechanics.footprint === "centered-vertical-edge"
          ? `<rect width="256" height="256" fill="#fff"/><rect x="105" width="46" height="256" fill="${color}"/>`
          : `<rect width="256" height="256" fill="${color}"/><circle cx="${40 + (index % 5) * 35}" cy="128" r="28" fill="#fef3c7"/>`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">${artwork}</svg>`;
      await sharp(Buffer.from(svg)).png().toFile(source);
      await importJob({
        repoRoot,
        workspaceRoot,
        jobId: job.id,
        source,
        now: `2026-08-25T00:${String(index).padStart(2, "0")}:00.000Z`,
        ...(index === 0 ? {
          execution: {
            provider: "openai",
            model: "gpt-image-2",
            quality: "low",
            request_id: "image-request-1",
            input_text_tokens: 252,
            output_image_tokens: 196,
            estimated_cost_usd: 0.00714,
            duration_ms: 12_345,
          },
        } : {}),
      });
    }

    const completed = await loadWorkspace(workspaceRoot);
    const report = await generateQa({ repoRoot, workspaceRoot, manifest: completed.manifest });
    expect(report.valid, JSON.stringify(report.assets.filter((asset) => asset.issues.length), null, 2)).toBe(true);
    expect(report.schema.valid).toBe(true);
    expect(completed.plan.jobs.every((job) => job.status === "normalized")).toBe(true);
    expect(completed.plan.jobs[0]!.attempts[0]!.execution).toEqual({
      provider: "openai",
      model: "gpt-image-2",
      quality: "low",
      request_id: "image-request-1",
      input_text_tokens: 252,
      output_image_tokens: 196,
      estimated_cost_usd: 0.00714,
      duration_ms: 12_345,
    });
    expect(completed.manifest.assets.floor).toHaveLength(8);
    expect(completed.manifest.assets.solidBlock).toHaveLength(4);

    for (const file of [
      "validation-report.json",
      "contact-sheet.png",
      "floor-seams.png",
      "floor-variation-20x20.png",
      "wall-door-alignment.png",
      "sample-map.png",
    ]) {
      expect((await readFile(path.join(workspaceRoot, "qa", file))).byteLength).toBeGreaterThan(0);
    }
    const wall = report.assets.find((asset) => asset.category === "wallSegmentH");
    expect(wall).toMatchObject({ format: "webp", width: 128, height: 128, has_alpha: true, alpha_min: 0, issues: [] });

    // Same pack, one duplicate slot claim added — every other term of `valid` is
    // unchanged, so only `schema.warnings` can move it. Without that term the
    // duplicate-slot and WebP-only checks had nothing downstream to act on.
    completed.manifest.assets.floor!.push({ ...completed.manifest.assets.floor![0]! });
    const withDuplicate = await validateAuthoredPack({ repoRoot, manifest: completed.manifest });
    expect(withDuplicate.schema.valid).toBe(true);
    expect(withDuplicate.assets.every((asset) => asset.issues.length === 0)).toBe(true);
    expect(withDuplicate.schema.warnings).toContain("floor/0: duplicate asset slot");
    expect(withDuplicate.valid).toBe(false);
  }, 30_000);
});

describe("checks that were measured and then discarded", () => {
  // edge_delta was written into the report and never compared against anything,
  // so a visibly seamed floor passed qa with exit 0.
  it("fails a floor whose opposite edges do not meet", async () => {
    const repoRoot = await temporaryRepo();
    await writeTile(repoRoot, "floor/0.webp", true);
    const report = await validateAuthoredPack({
      repoRoot,
      manifest: fixtureManifest({ floor: [{ variant: 0, url: "floor/0.webp" }] }),
    });

    const floor = report.assets[0]!;
    expect(floor.edge_delta).toBeGreaterThan(40);
    expect(floor.issues.join(" ")).toMatch(/will show a seam/);
    expect(report.valid).toBe(false);
  });

  // The previews read paths straight from the manifest, so a missing webp killed
  // qa with a raw sharp error instead of producing its exit-1 report.
  it("reports a missing asset instead of dying inside a QA preview", async () => {
    const repoRoot = await temporaryRepo();
    const workspaceRoot = path.join(repoRoot, "workspace");
    await mkdir(path.join(workspaceRoot, "qa"), { recursive: true });
    await writeTile(repoRoot, "floor/0.webp");
    await writeTile(repoRoot, "solidBlock/0.webp");
    const manifest = fixtureManifest({
      floor: [{ variant: 0, url: "floor/0.webp" }],
      solidBlock: [{ variant: 0, url: "solidBlock/0.webp" }],
      doorClosedH: [{ variant: 0, url: "doorClosedH/0.webp" }],
    });

    const report = await generateQa({ repoRoot, workspaceRoot, manifest });

    expect(report.assets.find((asset) => asset.category === "doorClosedH")).toMatchObject({
      exists: false,
      issues: ["file is missing"],
    });
    expect(report.valid).toBe(false);
    expect((await readFile(path.join(workspaceRoot, "qa", "sample-map.png"))).byteLength).toBeGreaterThan(0);
  });
});

// sharp pads a `contain` resize with opaque black by default, which put black
// bands on an overlay tile whose whole contract is transparency outside its
// footprint. importJob accepts sources up to 3:1, so this is the normal case.
it("pads a non-square overlay source with transparency, not black", async () => {
  const repoRoot = await temporaryRepo();
  const workspaceRoot = path.join(repoRoot, "art-src");
  await initWorkspace({
    repoRoot,
    workspaceRoot,
    packId: "fixture",
    name: "Fixture",
    theme: "A plain fixture pack.",
    packVersion: 1,
    artBible: defaultArtBible({ theme: "A plain fixture pack." }),
    now: "2026-08-26T00:00:00.000Z",
  });
  await rebuildPlan(workspaceRoot, ["objectChest:0"]);

  const source = path.join(repoRoot, "chest.png");
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="256"><rect width="512" height="256" fill="#7c3aed"/></svg>`))
    .png()
    .toFile(source);
  await importJob({ repoRoot, workspaceRoot, jobId: "objectChest:0", source, now: "2026-08-26T00:01:00.000Z" });

  const tile = path.join(repoRoot, "public", "cartographer", "fixture", "v1", "objectChest", "0.webp");
  const { data, info } = await sharp(tile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alphaAt = (x: number, y: number) => data[(y * info.width + x) * info.channels + 3]!;
  expect(alphaAt(64, 20)).toBe(0);
  expect(alphaAt(64, 107)).toBe(0);
  expect(alphaAt(64, 64)).toBeGreaterThan(200);
}, 30_000);
