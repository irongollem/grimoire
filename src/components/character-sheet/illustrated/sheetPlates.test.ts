// sheetPlates.test.ts — holds the plate filenames in sheetConfig.{a4,letter}.ts
// against the files actually on disk in src/assets/sheets/.
//
// WHY THIS EXISTS: IllustratedSheet.vue resolves a plate by building the glob key
// `/src/assets/sheets/<size>/<plate>` and indexing an import.meta.glob record. A
// name that matches no file yields `undefined`, which becomes an <img> with no src
// — a blank page behind the fields. Nothing catches that: it is not a type error
// (plate is a string), not a build error (the glob is resolved by key at runtime,
// not by the bundler), and no unit test mounts the component with real assets.
// It surfaces only when a DM prints a sheet and gets bare parchment.
//
// The format assertion is the second half. The plates were 20 PNGs totalling 49 MB
// — 65% of the build output and, being under swPlugin's 3 MB cutoff, precached on
// every first visit. They are WebP q95 now, which the export path's JPEG re-encode
// makes free (see the note at the top of IllustratedSheet.vue). Asserting the
// extension keeps a re-export from silently putting the 49 MB back.

import { describe, it, expect } from "vitest";
import { A4 } from "./sheetConfig.a4";
import { LETTER } from "./sheetConfig.letter";
import type { SizeConfig } from "./sheetTypes";

// The same glob IllustratedSheet.vue uses, resolved the same way, so this test
// exercises the real lookup rather than a hand-built filesystem path that could
// agree with the config while production disagrees.
const plateModules = import.meta.glob("/src/assets/sheets/**/*.webp", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const SIZES: ReadonlyArray<readonly [dir: string, config: SizeConfig]> = [
  ["a4", A4],
  ["letter", LETTER],
];

/** Every (pageSize, theme, side) triple, flattened to the plate it names. */
function plates(): Array<{ label: string; dir: string; plate: string }> {
  return SIZES.flatMap(([dir, config]) =>
    Object.entries(config).flatMap(([theme, sides]) =>
      (["front", "back"] as const).map((side) => ({
        label: `${dir}/${theme}/${side}`,
        dir,
        plate: sides[side].plate,
      })),
    ),
  );
}

describe("illustrated sheet plates", () => {
  it("covers both page sizes and all five themes, front and back", () => {
    // 2 sizes x 5 themes x 2 sides. Guards the traversal above against silently
    // iterating nothing if a config's shape changes.
    expect(plates()).toHaveLength(20);
  });

  it.each(plates())("$label resolves to a real asset", ({ dir, plate }) => {
    const key = `/src/assets/sheets/${dir}/${plate}`;
    expect(plateModules[key], `no asset for plate key ${key}`).toBeDefined();
  });

  it("leaves no plate asset unreferenced by either config", () => {
    const referenced = new Set(plates().map((p) => `/src/assets/sheets/${p.dir}/${p.plate}`));
    const orphans = Object.keys(plateModules).filter((k) => !referenced.has(k));
    expect(orphans).toEqual([]);
  });

  it("keeps every plate in WebP — a PNG re-export would restore ~40 MB of build output", () => {
    const offenders = plates().filter((p) => !p.plate.endsWith(".webp"));
    expect(offenders.map((p) => `${p.label} -> ${p.plate}`)).toEqual([]);
  });
});
