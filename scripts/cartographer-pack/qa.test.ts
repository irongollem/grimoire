import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { seededVariantGrid } from "./qa";
import { defaultArtBible, importJob, initWorkspace, loadWorkspace } from "./workspace";
import { generateQa } from "./qa";

const temporaryRoots: string[] = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

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
  }, 30_000);
});
