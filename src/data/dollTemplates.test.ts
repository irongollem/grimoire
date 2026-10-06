import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDollSheets } from "@edge-shared/paperDoll/types.ts";
import { DOLL_TEMPLATE_LAYOUTS, DOLL_TEMPLATE_SHEETS } from "./dollTemplates";

/**
 * `npm run doll:templates` writes the size templates in three places: the app
 * art, the edge function's reference copies, and the generated data file. This
 * holds the three equal, the same mirror idea as bucketRegistryMirror.test.ts.
 * It fails until the templates have been rendered.
 */
const root = resolve(import.meta.dirname, "../..");
const appDir = resolve(root, "public/assets/doll");
const edgeDir = resolve(root, "supabase/functions/generate-character-doll/templates");

describe("doll templates", () => {
  it("keeps the edge function's reference sheets byte-identical to the app art", () => {
    const edgeFiles = existsSync(edgeDir) ? readdirSync(edgeDir).filter((f) => f.endsWith(".webp")) : [];
    expect(edgeFiles.sort()).toEqual(["medium-armour.webp", "medium-garb.webp", "small-armour.webp", "small-garb.webp"]);
    for (const file of edgeFiles) {
      const edge = readFileSync(resolve(edgeDir, file));
      const app = readFileSync(resolve(appDir, file));
      expect(edge.equals(app), `${file} differs from public/assets/doll/${file}`).toBe(true);
    }
  });

  it("points every sheet at a file that exists", () => {
    for (const sizes of Object.values(DOLL_TEMPLATE_SHEETS)) {
      for (const path of Object.values(sizes)) {
        expect(existsSync(resolve(root, "public", path.replace(/^\//, ""))), path).toBe(true);
      }
    }
  });

  it("holds a layout that parses as a doll for each size", () => {
    for (const [size, layout] of Object.entries(DOLL_TEMPLATE_LAYOUTS)) {
      const doll = parseDollSheets({
        version: 1,
        sheets: DOLL_TEMPLATE_SHEETS[size as keyof typeof DOLL_TEMPLATE_SHEETS],
        layout,
        model: "template",
        generatedAt: "2026-01-01T00:00:00.000Z",
      });
      expect(doll, `${size} layout`).not.toBeNull();
    }
  });
});
