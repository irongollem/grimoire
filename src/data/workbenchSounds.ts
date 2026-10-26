/**
 * The crafting workbench's sounds (#1100), as data: one work sound per bench
 * (disciplines that share a bench share its sound, exactly as they share its
 * art in `WORKBENCH_BENCH_FOR`) and three outcome stings.
 *
 * `slug` is a `sound_library.slug`; its file lives at `sounds/library/<slug>.ogg`
 * (see `src/lib/crafting/workbenchAudio.ts`). The maintainer chose each one by
 * ear (26 Oct 2026); the `crafting/` ones were trimmed for the bench and added to
 * the library (art-src/sounds/manifest.json, with their credits in CREDITS.md).
 * A null slug would play nothing. `repeat` plays a short hit that many times with
 * `gapMs` between starts (hammer on anvil, two or three blows).
 *
 * Direction for each, from the issue:
 *   ws-forge        hammer on anvil, two or three blows
 *   ws-stoneyard    chisel on stone
 *   ws-laboratory   glass, a bubbling flask (alchemy, poisoncraft)
 *   ws-herbalist    mortar and pestle
 *   ws-kitchen      a sizzle
 *   ws-brewhouse    liquid poured into a cask
 *   ws-tannery      an awl and leather being stitched
 *   ws-loom         a loom's shuttle and beater
 *   ws-woodshop     a plane or saw on wood
 *   ws-finebench    a small file and fine metal clicks (jewelcrafting, tinkering)
 *   ws-desk         a quill scratching, a seal pressed (scribing, forgery)
 *   painting        a brush on canvas (own sound, shares the desk's art)
 *   success         a warm, short flourish
 *   failure         a dull, falling note
 *   critical        a crack and a hiss: something breaking and burning
 */
import type { WorkbenchBenchId } from "@/data/workbenchArt";
import type { CraftingDiscipline } from "@/types/crafting.types";

export interface WorkbenchSound {
  /** `sound_library.slug`, or null while the sound is not chosen. */
  slug: string | null;
  /** Playback volume, 0 to 1. Default 1. */
  gain?: number;
  /** How many times the sound plays. Default 1. */
  repeat?: number;
  /** Milliseconds between the starts of repeats. */
  gapMs?: number;
}

export type WorkbenchSting = "success" | "failure" | "critical";

export const WORKBENCH_WORK_SOUNDS: Record<WorkbenchBenchId, WorkbenchSound> = {
  "ws-forge": { slug: "crafting/forge-anvil-ring", repeat: 3, gapMs: 450 },
  "ws-laboratory": { slug: "crafting/acid-bubble" },
  "ws-finebench": { slug: "town/metal-wood-sfx-pack--tools-07" },
  "ws-tannery": { slug: "crafting/folding-leather" },
  "ws-woodshop": { slug: "crafting/wood-saw-rub" },
  "ws-kitchen": { slug: "crafting/frying-pan-sizzle" },
  "ws-desk": { slug: "battle/rpg-sfx-pack--book-02" },
  "ws-herbalist": { slug: "crafting/stone-grind" },
  "ws-brewhouse": { slug: "crafting/boiling-pot" },
  "ws-loom": { slug: "crafting/shuttle-loom" },
  "ws-stoneyard": { slug: "crafting/pick-on-rock" },
};

/** A discipline that shares a bench's art but not its sound; checked before the bench entry. */
export const WORKBENCH_DISCIPLINE_SOUNDS: Partial<Record<CraftingDiscipline, WorkbenchSound>> = {
  painting: { slug: "crafting/bristle-brushing" },
};

export const WORKBENCH_STINGS: Record<WorkbenchSting, WorkbenchSound> = {
  success: { slug: "crafting/fanfare-closing-notes" },
  failure: { slug: "town/metal-wood-sfx-pack--wood-breaking-01" },
  critical: { slug: "crafting/bottle-break" },
};
