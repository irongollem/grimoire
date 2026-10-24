import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WORKBENCH_ART_DIR,
  WORKBENCH_BENCH_FOR,
  WORKBENCH_BENCHES,
  WORKBENCH_DISHES,
  WORKBENCH_SPRITES,
} from "@/data/workbenchArt";
import type { CraftingDiscipline } from "@/types/crafting.types";
import { benchArtFor, fxSrc, spriteSrc } from "./art";

const root = resolve(import.meta.dirname, "../../../..");
const onDisk = (id: string) => existsSync(resolve(root, "public", WORKBENCH_ART_DIR.replace(/^\//, ""), `${id}.webp`));

describe("benchArtFor", () => {
  it.each(Object.keys(WORKBENCH_BENCH_FOR) as CraftingDiscipline[])("%s resolves a bench, dish and urls", (d) => {
    const art = benchArtFor(d);
    expect(art.bench.id).toBe(WORKBENCH_BENCH_FOR[d]);
    expect(art.dish.id).toBe(art.bench.dish);
    expect(art.src).toContain(`${art.bench.id}.webp`);
    expect(art.phoneSrc).toContain(`${art.bench.id}@768.webp`);
    expect(art.dishSrc).toContain(`${art.dish.id}.webp`);
  });

  it("spriteSrc names the sprite file", () => {
    expect(spriteSrc("mat-ore")).toContain("mat-ore.webp");
  });

  it("fxSrc names the effect plate, and both plates are on disk", () => {
    expect(fxSrc("fx-sparks")).toContain("fx-sparks.webp");
    expect(onDisk("fx-sparks")).toBe(true);
    expect(onDisk("fx-steam")).toBe(true);
  });
});

describe("the art on disk", () => {
  it("has a file for every bench, its phone banner, every dish and every sprite", () => {
    for (const id of Object.keys(WORKBENCH_BENCHES)) {
      expect(onDisk(id), id).toBe(true);
      expect(onDisk(`${id}@768`), `${id}@768`).toBe(true);
    }
    for (const id of Object.keys(WORKBENCH_DISHES)) expect(onDisk(id), id).toBe(true);
    for (const id of Object.keys(WORKBENCH_SPRITES)) expect(onDisk(id), id).toBe(true);
  });
});
