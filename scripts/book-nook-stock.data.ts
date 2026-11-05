/**
 * The stock shelf of Book Nook (#1142): every painted part `npm run nook:stock` puts into
 * `library_nook_parts`. Data only; a test holds it equal to `CutoutPreset` / `FramePreset`.
 * `file` is the name in the painter folder (the candle flame predates the `stock-` naming).
 */
import type { CutoutPreset, FramePreset, NookPartGroup } from "../src/types/bookNook.types.ts";

export interface StockPart {
  id: string;
  file: string;
  kind: "cutout" | "frame";
  group_key: NookPartGroup;
  name: string;
  preset: CutoutPreset | FramePreset;
  sort_order: number;
}

const FLAME: CutoutPreset = { hold: "stands", motion: "Flame" };
const HANG: CutoutPreset = { hold: "hangs", motion: "Hanging" };
const CLOTH: CutoutPreset = { hold: "hangs", motion: "Cloth" };
const WANDER: CutoutPreset = { hold: "floats", motion: "Wandering" };

function cutout(
  slug: string,
  group_key: NookPartGroup,
  name: string,
  preset: CutoutPreset,
  file = `stock-${slug}.png`,
): Omit<StockPart, "sort_order"> {
  return { id: `stock-${slug}`, file, kind: "cutout", group_key, name, preset };
}

const cutouts: Omit<StockPart, "sort_order">[] = [
  cutout("candle-flame", "fire", "Candle flame", FLAME, "inn-flame.png"),
  cutout("torch-flame", "fire", "Torch flame", FLAME),
  cutout("hearth-fire", "fire", "Hearth fire", FLAME),
  cutout("brazier-flames", "fire", "Brazier flames", FLAME),
  cutout("campfire-flames", "fire", "Campfire flames", FLAME),
  cutout("lamp-flame", "fire", "Oil lamp flame", FLAME),
  cutout("lantern", "fire", "Lantern", HANG),
  cutout("chandelier", "fire", "Chandelier", HANG),
  cutout("curtain", "cloth", "Curtain", CLOTH),
  cutout("curtain-pair", "cloth", "Curtain pair", CLOTH),
  cutout("banner", "cloth", "Banner", CLOTH),
  cutout("tapestry", "cloth", "Tapestry", CLOTH),
  cutout("hanging-flag", "cloth", "Hanging flag", CLOTH),
  cutout("torn-sail", "cloth", "Torn sail", CLOTH),
  cutout("tattered-drape", "cloth", "Tattered drape", CLOTH),
  cutout("cobweb", "cloth", "Cobweb", HANG),
  cutout("crow", "creatures", "Crow", WANDER),
  cutout("bat", "creatures", "Bat", WANDER),
  cutout("songbird", "creatures", "Songbird", WANDER),
  cutout("gull", "creatures", "Gull", WANDER),
  cutout("moth", "creatures", "Moth", WANDER),
  cutout("fish", "creatures", "Fish", WANDER),
  cutout("butterfly", "creatures", "Butterfly", WANDER),
  cutout("sleeping-cat", "creatures", "Sleeping cat", { hold: "stands", motion: "Floating" }),
  cutout("fog-bank", "air", "Fog bank", WANDER),
  cutout("low-cloud", "air", "Low cloud", WANDER),
  cutout("mist", "air", "Mist on water", WANDER),
  cutout("tree-branch", "air", "Tree branch", HANG),
  cutout("hanging-moss", "air", "Hanging moss", HANG),
  cutout("ivy", "air", "Ivy", CLOTH),
  cutout("reeds", "air", "Reeds", { hold: "stands", motion: "Hanging" }),
  cutout("rowing-boat", "air", "Rowing boat", { hold: "floats", motion: "Floating" }),
];

const STYLES: [string, string][] = [
  ["arch", "Arch"],
  ["illuminated", "Illuminated border"],
  ["cameo", "Cameo"],
  ["deckled", "Deckled mount"],
];

const frames: Omit<StockPart, "sort_order">[] = STYLES.flatMap(([style, label]) =>
  (["tall", "wide"] as const).map((shape) => ({
    id: `frame-${style}-${shape}`,
    file: `frame-${style}-${shape}.png`,
    kind: "frame" as const,
    group_key: "frames" as const,
    name: `${label} (${shape})`,
    preset: { shape } satisfies FramePreset,
  })),
);

export const STOCK_PARTS: readonly StockPart[] = [...cutouts, ...frames].map((p, i) => ({
  ...p,
  sort_order: (i + 1) * 10,
}));

