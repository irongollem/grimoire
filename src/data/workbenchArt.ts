/**
 * The crafting workbench's art (#1080), as data: which bench and dish each
 * discipline uses, where a material sits in each dish, and which sprite a
 * tag resolves to. Logic lives in `src/lib/crafting/workbench/`.
 *
 * Source of truth is `docs/plans/crafting-workbench/manifest.json` (the art
 * contract and every asset) plus the cutter's measurements
 * (`art-955/workbench/cut.py`). The files themselves are in
 * `public/assets/crafting/workbench/`, always loaded through `artUrl()`.
 *
 * All of it was painted with OpenAI image generation (19-24 Oct 2026); the
 * workbench shows one set-level AI label for it (WORKBENCH_ART_PROVENANCE).
 */
import type { CraftingDiscipline } from "@/types/crafting.types";

export const WORKBENCH_ART_DIR = "/assets/crafting/workbench";

export const WORKBENCH_ART_PROVENANCE = { provider: "OpenAI", generatedAt: "2026-10-19" } as const;

export type WorkbenchBenchId =
  | "ws-forge"
  | "ws-laboratory"
  | "ws-finebench"
  | "ws-tannery"
  | "ws-woodshop"
  | "ws-kitchen"
  | "ws-desk"
  | "ws-herbalist"
  | "ws-brewhouse"
  | "ws-loom"
  | "ws-stoneyard";

export type WorkbenchDishId =
  | "rc-iron-dish"
  | "rc-glass-dish"
  | "rc-velvet-tray"
  | "rc-cloth-mat"
  | "rc-wooden-tray"
  | "rc-wooden-bowl";

export type WorkbenchSpriteId =
  | "mat-ingot-iron"
  | "mat-ingot-gold"
  | "mat-ore"
  | "mat-scrap"
  | "mat-wood"
  | "mat-cloth"
  | "mat-leather"
  | "mat-charcoal"
  | "mat-bundle"
  | "mat-ruined"
  | "mat-flask"
  | "mat-powder"
  | "mat-herb"
  | "mat-mushroom"
  | "mat-resin"
  | "mat-clay"
  | "mat-fiber"
  | "mat-crystal"
  | "mat-gem-rough"
  | "mat-hide"
  | "mat-stone"
  | "mat-grain"
  | "mat-meat"
  | "mat-fish"
  | "mat-vegetables"
  | "mat-fruit"
  | "mat-honey"
  | "mat-bone"
  | "mat-feather"
  | "mat-parchment"
  | "mat-ink"
  | "mat-wax"
  | "mat-dye"
  | "mat-bread"
  | "mat-ingot-copper";

export interface WorkbenchBench {
  id: WorkbenchBenchId;
  /** Shown beside the discipline ("Smithing · The forge"). */
  label: string;
  dish: WorkbenchDishId;
  /** Picture size in px (desktop file); the phone file is `<id>@768.webp`. */
  width: number;
  height: number;
}

/** The dish's opening (inner edge of the rim) as fractions of the picture, and how deep its floor sits:
 *  a material's lowest opaque pixel goes at (cx, cy + floor * ry). `floor` never exceeds 0.95, or the base
 *  slips behind the dish's outer front wall. */
export interface WorkbenchDish {
  id: WorkbenchDishId;
  width: number;
  height: number;
  opening: { cx: number; cy: number; rx: number; ry: number; floor: number };
}

/** `base` is the lowest opaque row and `left` / `right` the horizontal footprint, as fractions of the
 *  picture, so the page can stand the material on the floor and size its occlusion to it. */
export interface WorkbenchSprite {
  id: WorkbenchSpriteId;
  width: number;
  height: number;
  base: number;
  left: number;
  right: number;
  /** Colour variants as CSS filters, keyed by the tag that selects them. */
  tints?: Record<string, string>;
}

export const WORKBENCH_BENCH_FOR: Record<CraftingDiscipline, WorkbenchBenchId> = {
  alchemy: "ws-laboratory",
  smithing: "ws-forge",
  leathercraft: "ws-tannery",
  woodcraft: "ws-woodshop",
  jewelcrafting: "ws-finebench",
  herbalism: "ws-herbalist",
  poisoncraft: "ws-laboratory",
  tinkering: "ws-finebench",
  cooking: "ws-kitchen",
  scribing: "ws-desk",
  forgery: "ws-desk",
  brewing: "ws-brewhouse",
  weaving: "ws-loom",
  masonry: "ws-stoneyard",
  painting: "ws-desk",
};

export const WORKBENCH_BENCHES: Record<WorkbenchBenchId, WorkbenchBench> = {
  "ws-forge": { id: "ws-forge", label: "The forge", dish: "rc-iron-dish", width: 1536, height: 1024 },
  "ws-laboratory": { id: "ws-laboratory", label: "The laboratory", dish: "rc-glass-dish", width: 1536, height: 1024 },
  "ws-finebench": { id: "ws-finebench", label: "The fine bench", dish: "rc-velvet-tray", width: 1536, height: 1024 },
  "ws-tannery": { id: "ws-tannery", label: "The tannery bench", dish: "rc-cloth-mat", width: 1536, height: 1024 },
  "ws-woodshop": { id: "ws-woodshop", label: "The woodshop", dish: "rc-wooden-tray", width: 1536, height: 1024 },
  "ws-kitchen": { id: "ws-kitchen", label: "The kitchen", dish: "rc-wooden-bowl", width: 1536, height: 1024 },
  "ws-desk": { id: "ws-desk", label: "The writing desk", dish: "rc-wooden-tray", width: 1536, height: 1024 },
  "ws-herbalist": { id: "ws-herbalist", label: "The herbalist's table", dish: "rc-wooden-bowl", width: 1536, height: 1024 },
  "ws-brewhouse": { id: "ws-brewhouse", label: "The brewhouse", dish: "rc-wooden-bowl", width: 1536, height: 1024 },
  "ws-loom": { id: "ws-loom", label: "The loom", dish: "rc-cloth-mat", width: 1536, height: 1024 },
  "ws-stoneyard": { id: "ws-stoneyard", label: "The stoneyard", dish: "rc-wooden-tray", width: 1536, height: 1024 },
};

export const WORKBENCH_DISHES: Record<WorkbenchDishId, WorkbenchDish> = {
  "rc-iron-dish": { id: "rc-iron-dish", width: 512, height: 356, opening: { cx: 0.5, cy: 0.43, rx: 0.46, ry: 0.36, floor: 0.672 } },
  "rc-glass-dish": { id: "rc-glass-dish", width: 512, height: 346, opening: { cx: 0.5, cy: 0.365, rx: 0.45, ry: 0.295, floor: 0.95 } },
  "rc-velvet-tray": { id: "rc-velvet-tray", width: 512, height: 383, opening: { cx: 0.5, cy: 0.41, rx: 0.46, ry: 0.37, floor: 0.68 } },
  "rc-cloth-mat": { id: "rc-cloth-mat", width: 512, height: 363, opening: { cx: 0.5, cy: 0.43, rx: 0.46, ry: 0.37, floor: 0.68 } },
  "rc-wooden-tray": { id: "rc-wooden-tray", width: 512, height: 370, opening: { cx: 0.5, cy: 0.43, rx: 0.45, ry: 0.35, floor: 0.664 } },
  "rc-wooden-bowl": { id: "rc-wooden-bowl", width: 512, height: 375, opening: { cx: 0.505, cy: 0.39, rx: 0.455, ry: 0.33, floor: 0.712 } },
};

export const WORKBENCH_SPRITES: Record<WorkbenchSpriteId, WorkbenchSprite> = {
  "mat-ingot-iron": { id: "mat-ingot-iron", width: 384, height: 273, base: 0.9487, left: 0.0365, right: 0.9635, tints: { "silver": "saturate(0.4) brightness(1.25)", "steel": "saturate(0.7) brightness(1.1)" } },
  "mat-ingot-gold": { id: "mat-ingot-gold", width: 384, height: 275, base: 0.9455, left: 0.0365, right: 0.9609 },
  "mat-ore": { id: "mat-ore", width: 384, height: 284, base: 0.9507, left: 0.0365, right: 0.9635, tints: { "gold": "sepia(0.6) saturate(1.6) hue-rotate(-10deg) brightness(1.1)", "silver": "saturate(0.3) brightness(1.15)" } },
  "mat-scrap": { id: "mat-scrap", width: 384, height: 250, base: 0.94, left: 0.0391, right: 0.9635 },
  "mat-wood": { id: "mat-wood", width: 384, height: 281, base: 0.9466, left: 0.0391, right: 0.9609 },
  "mat-cloth": { id: "mat-cloth", width: 384, height: 259, base: 0.9459, left: 0.0365, right: 0.9635 },
  "mat-leather": { id: "mat-leather", width: 384, height: 294, base: 0.9524, left: 0.0391, right: 0.9635 },
  "mat-charcoal": { id: "mat-charcoal", width: 384, height: 279, base: 0.9462, left: 0.0391, right: 0.9609 },
  "mat-bundle": { id: "mat-bundle", width: 384, height: 269, base: 0.9442, left: 0.0365, right: 0.9635 },
  "mat-ruined": { id: "mat-ruined", width: 384, height: 284, base: 0.9507, left: 0.0365, right: 0.9635 },
  "mat-flask": { id: "mat-flask", width: 383, height: 384, base: 0.9635, left: 0.0366, right: 0.9634, tints: { "oil": "sepia(0.8) saturate(2) hue-rotate(-5deg)", "wine": "sepia(1) saturate(3) hue-rotate(-50deg) brightness(0.7)", "ale": "sepia(1) saturate(1.6) brightness(0.8)", "poison": "sepia(1) saturate(2.5) hue-rotate(50deg)", "venom": "sepia(1) saturate(2) hue-rotate(30deg)" } },
  "mat-powder": { id: "mat-powder", width: 384, height: 261, base: 0.9464, left: 0.0365, right: 0.9635, tints: { "brimstone": "sepia(1) saturate(4) hue-rotate(5deg) brightness(1.05)", "sand": "sepia(0.6) saturate(1.2) brightness(0.95)", "spice": "sepia(1) saturate(2.5) hue-rotate(-25deg) brightness(0.7)" } },
  "mat-herb": { id: "mat-herb", width: 384, height: 257, base: 0.9416, left: 0.0365, right: 0.9635, tints: { "seaweed": "saturate(0.6) brightness(0.7) hue-rotate(20deg)" } },
  "mat-mushroom": { id: "mat-mushroom", width: 384, height: 299, base: 0.9498, left: 0.0391, right: 0.9635, tints: { "phosphorescent": "sepia(0.5) saturate(2) hue-rotate(60deg) brightness(1.2) drop-shadow(0 0 0.375rem rgb(160 255 170 / 0.6))" } },
  "mat-resin": { id: "mat-resin", width: 384, height: 295, base: 0.9525, left: 0.0365, right: 0.9635 },
  "mat-clay": { id: "mat-clay", width: 384, height: 292, base: 0.9521, left: 0.0391, right: 0.9609 },
  "mat-fiber": { id: "mat-fiber", width: 384, height: 287, base: 0.9512, left: 0.0365, right: 0.9635, tints: { "silk": "brightness(1.2) saturate(0.5)" } },
  "mat-crystal": { id: "mat-crystal", width: 384, height: 259, base: 0.9459, left: 0.0365, right: 0.9609 },
  "mat-gem-rough": { id: "mat-gem-rough", width: 384, height: 278, base: 0.9496, left: 0.0391, right: 0.9609, tints: { "ruby": "sepia(1) saturate(4) hue-rotate(-50deg)", "sapphire": "sepia(1) saturate(4) hue-rotate(180deg)", "emerald": "sepia(1) saturate(4) hue-rotate(80deg)", "amethyst": "sepia(1) saturate(3) hue-rotate(230deg)", "topaz": "sepia(1) saturate(3) brightness(1.05)", "onyx": "saturate(0) brightness(0.35)", "bloodstone": "sepia(1) saturate(2) hue-rotate(90deg) brightness(0.5)", "agate": "sepia(1) saturate(1.5) hue-rotate(-20deg) brightness(0.8)", "moss agate": "sepia(1) saturate(1.5) hue-rotate(60deg) brightness(1.05)" } },
  "mat-hide": { id: "mat-hide", width: 384, height: 282, base: 0.9504, left: 0.0365, right: 0.9635 },
  "mat-stone": { id: "mat-stone", width: 384, height: 283, base: 0.9505, left: 0.0391, right: 0.9635 },
  "mat-grain": { id: "mat-grain", width: 384, height: 287, base: 0.9477, left: 0.0365, right: 0.9635 },
  "mat-meat": { id: "mat-meat", width: 384, height: 294, base: 0.9524, left: 0.0365, right: 0.9609 },
  "mat-fish": { id: "mat-fish", width: 384, height: 234, base: 0.9402, left: 0.0391, right: 0.9766 },
  "mat-vegetables": { id: "mat-vegetables", width: 384, height: 270, base: 0.9444, left: 0.0365, right: 0.9635 },
  "mat-fruit": { id: "mat-fruit", width: 384, height: 319, base: 0.953, left: 0.0391, right: 0.9609 },
  "mat-honey": { id: "mat-honey", width: 351, height: 384, base: 0.9609, left: 0.0427, right: 0.9573 },
  "mat-bone": { id: "mat-bone", width: 384, height: 272, base: 0.9449, left: 0.0365, right: 0.9635 },
  "mat-feather": { id: "mat-feather", width: 384, height: 304, base: 0.9539, left: 0.0365, right: 0.9635 },
  "mat-parchment": { id: "mat-parchment", width: 384, height: 285, base: 0.9509, left: 0.0365, right: 0.9635 },
  "mat-ink": { id: "mat-ink", width: 384, height: 313, base: 0.9553, left: 0.0391, right: 0.9635 },
  "mat-wax": { id: "mat-wax", width: 384, height: 270, base: 0.9481, left: 0.0365, right: 0.9609 },
  "mat-dye": { id: "mat-dye", width: 384, height: 271, base: 0.9446, left: 0.0365, right: 0.9609, tints: { "blue": "hue-rotate(180deg) saturate(1.2)", "black": "saturate(0.2) brightness(0.35)", "red": "hue-rotate(-30deg) saturate(1.5)", "green": "hue-rotate(70deg)", "yellow": "saturate(1.4) brightness(1.15)" } },
  "mat-bread": { id: "mat-bread", width: 384, height: 308, base: 0.9513, left: 0.0391, right: 0.9635 },
  "mat-ingot-copper": { id: "mat-ingot-copper", width: 384, height: 276, base: 0.9493, left: 0.0365, right: 0.9635 },
};

/** Ordered: the first entry whose `match` tags are all present picks the sprite. Specific before general
 *  ("ore" before "gold", "ingot" before "metal"). `tint` forces a variant; otherwise a tint is chosen by any
 *  other tag the item carries that names one of the sprite's tints. */
export const WORKBENCH_TAG_ORDER: readonly { match: readonly string[]; sprite: WorkbenchSpriteId; tint?: string }[] = [
  { match: ["ore"], sprite: "mat-ore" },
  { match: ["gem"], sprite: "mat-gem-rough" },
  { match: ["rough"], sprite: "mat-gem-rough" },
  { match: ["gold"], sprite: "mat-ingot-gold" },
  { match: ["copper"], sprite: "mat-ingot-copper" },
  { match: ["ingot"], sprite: "mat-ingot-iron" },
  { match: ["silver"], sprite: "mat-ingot-iron", tint: "silver" },
  { match: ["iron"], sprite: "mat-ingot-iron" },
  { match: ["scrap"], sprite: "mat-scrap" },
  { match: ["metal"], sprite: "mat-scrap" },
  { match: ["crystal"], sprite: "mat-crystal" },
  { match: ["leather"], sprite: "mat-leather" },
  { match: ["hide"], sprite: "mat-hide" },
  { match: ["fur"], sprite: "mat-hide" },
  { match: ["wool"], sprite: "mat-fiber" },
  { match: ["silk"], sprite: "mat-fiber", tint: "silk" },
  { match: ["fiber"], sprite: "mat-fiber" },
  { match: ["cloth"], sprite: "mat-cloth" },
  { match: ["canvas"], sprite: "mat-cloth" },
  { match: ["wood"], sprite: "mat-wood" },
  { match: ["bone"], sprite: "mat-bone" },
  { match: ["feather"], sprite: "mat-feather" },
  { match: ["charcoal"], sprite: "mat-charcoal" },
  { match: ["stone"], sprite: "mat-stone" },
  { match: ["flint"], sprite: "mat-stone" },
  { match: ["clay"], sprite: "mat-clay" },
  { match: ["resin"], sprite: "mat-resin" },
  { match: ["brimstone"], sprite: "mat-powder", tint: "brimstone" },
  { match: ["saltpetre"], sprite: "mat-powder" },
  { match: ["salt"], sprite: "mat-powder" },
  { match: ["sand"], sprite: "mat-powder", tint: "sand" },
  { match: ["spice"], sprite: "mat-powder", tint: "spice" },
  { match: ["mushroom"], sprite: "mat-mushroom" },
  { match: ["phosphorescent"], sprite: "mat-mushroom", tint: "phosphorescent" },
  { match: ["seaweed"], sprite: "mat-herb", tint: "seaweed" },
  { match: ["herb"], sprite: "mat-herb" },
  { match: ["healing"], sprite: "mat-herb" },
  { match: ["plant"], sprite: "mat-herb" },
  { match: ["honey"], sprite: "mat-honey" },
  { match: ["sweetener"], sprite: "mat-honey" },
  { match: ["grain"], sprite: "mat-grain" },
  { match: ["meat"], sprite: "mat-meat" },
  { match: ["fish"], sprite: "mat-fish" },
  { match: ["vegetable"], sprite: "mat-vegetables" },
  { match: ["fruit"], sprite: "mat-fruit" },
  { match: ["bread"], sprite: "mat-bread" },
  { match: ["parchment"], sprite: "mat-parchment" },
  { match: ["ink"], sprite: "mat-ink" },
  { match: ["wax"], sprite: "mat-wax" },
  { match: ["dye"], sprite: "mat-dye" },
  { match: ["poison"], sprite: "mat-flask", tint: "poison" },
  { match: ["venom"], sprite: "mat-flask", tint: "venom" },
  { match: ["oil"], sprite: "mat-flask", tint: "oil" },
  { match: ["wine"], sprite: "mat-flask", tint: "wine" },
  { match: ["ale"], sprite: "mat-flask", tint: "ale" },
  { match: ["must"], sprite: "mat-flask", tint: "wine" },
  { match: ["alcohol"], sprite: "mat-flask", tint: "ale" },
  { match: ["solvent"], sprite: "mat-flask" },
  { match: ["water"], sprite: "mat-flask" },
  { match: ["drink"], sprite: "mat-flask" },
  { match: ["food"], sprite: "mat-bread" },
  { match: ["mineral"], sprite: "mat-ore" },
];

/** Tags that describe rather than name a material; they never pick a sprite on their own. */
export const WORKBENCH_DESCRIBING_TAGS: readonly string[] = ["material", "large", "raw", "blue", "black"];

/** When no tag matches: by item type, then the neutral bundle. */
export const WORKBENCH_TYPE_FALLBACK: Readonly<Record<string, WorkbenchSpriteId>> = { potion: "mat-flask", provision: "mat-vegetables" };
export const WORKBENCH_NEUTRAL_SPRITE: WorkbenchSpriteId = "mat-bundle";
export const WORKBENCH_RUINED_SPRITE: WorkbenchSpriteId = "mat-ruined";

/** Outcome effects, painted on black: draw with `mix-blend-mode: screen`, never cut. */
export const WORKBENCH_FX = { sparks: "fx-sparks", steam: "fx-steam" } as const;
export type WorkbenchFxId = (typeof WORKBENCH_FX)[keyof typeof WORKBENCH_FX];
