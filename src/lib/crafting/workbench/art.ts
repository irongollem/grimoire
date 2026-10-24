import {
  WORKBENCH_ART_DIR,
  WORKBENCH_BENCH_FOR,
  WORKBENCH_BENCHES,
  WORKBENCH_DISHES,
  type WorkbenchBench,
  type WorkbenchDish,
  type WorkbenchFxId,
  type WorkbenchSpriteId,
} from "@/data/workbenchArt";
import { artUrl } from "@/lib/assets/artUrl";
import type { CraftingDiscipline } from "@/types/crafting.types";

/** A discipline's bench picture, its phone banner, and the dish that sits on it. */
export interface BenchArt {
  bench: WorkbenchBench;
  dish: WorkbenchDish;
  src: string;
  phoneSrc: string;
  dishSrc: string;
}

export function benchArtFor(discipline: CraftingDiscipline): BenchArt {
  const bench = WORKBENCH_BENCHES[WORKBENCH_BENCH_FOR[discipline]];
  const dish = WORKBENCH_DISHES[bench.dish];
  return {
    bench,
    dish,
    src: artUrl(`${WORKBENCH_ART_DIR}/${bench.id}.webp`),
    phoneSrc: artUrl(`${WORKBENCH_ART_DIR}/${bench.id}@768.webp`),
    dishSrc: artUrl(`${WORKBENCH_ART_DIR}/${dish.id}.webp`),
  };
}

export function spriteSrc(id: WorkbenchSpriteId): string {
  return artUrl(`${WORKBENCH_ART_DIR}/${id}.webp`);
}

/** An effect plate. Painted on black: draw it with `mix-blend-mode: screen`, never cut. */
export function fxSrc(id: WorkbenchFxId): string {
  return artUrl(`${WORKBENCH_ART_DIR}/${id}.webp`);
}
