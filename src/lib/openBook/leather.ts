import type { OpenBookLeather } from "@/types/openBook.types";
import { artUrl } from "@/lib/assets/artUrl";

/**
 * The hides a book can be bound in, in one place for the reader's cover and binding and for the Settings tab's
 * swatches, cover preview and share cards. Oxblood and walnut are photographed hides used as they are; sea, night and
 * ash are the brown grain tinted through `background-blend-mode: luminosity`, which keeps the grain's light and dark
 * and takes the hue from the tint.
 */
export interface LeatherDef {
  label: string;
  /** The hide's colour: the tint for the blended ones, the fallback under the picture for the rest. */
  tint: string;
  textureUrl: string;
  blend: "normal" | "luminosity";
}

const OXBLOOD_TEXTURE = artUrl("/assets/open-book/leather-oxblood.webp");
const BROWN_TEXTURE = artUrl("/assets/open-book/leather.webp");

export const LEATHERS: Record<OpenBookLeather, LeatherDef> = {
  oxblood: { label: "Oxblood", tint: "#7a1f1a", textureUrl: OXBLOOD_TEXTURE, blend: "normal" },
  sea: { label: "Sea green", tint: "#1f5a4a", textureUrl: BROWN_TEXTURE, blend: "luminosity" },
  night: { label: "Night blue", tint: "#1f3a66", textureUrl: BROWN_TEXTURE, blend: "luminosity" },
  walnut: { label: "Walnut", tint: "#6b4226", textureUrl: BROWN_TEXTURE, blend: "normal" },
  ash: { label: "Ash", tint: "#4a4a46", textureUrl: BROWN_TEXTURE, blend: "luminosity" },
};

/** Grain size on a small piece (swatch, cover preview, share card); the reader's full-size cover sets its own. */
export const SMALL_GRAIN = "11rem";

/** Inline background for a small piece of leather, with a grain fine enough to read at that size. */
export function leatherBackground(leather: OpenBookLeather, grain: string = SMALL_GRAIN): Record<string, string> {
  const def = LEATHERS[leather];
  return {
    backgroundColor: def.tint,
    backgroundImage: `url("${def.textureUrl}")`,
    backgroundSize: `${grain} ${grain}`,
    backgroundBlendMode: def.blend,
  };
}

/** The reader's CSS variables (`.ob-leather` in book.css reads them); the cover and the binding share it. */
export function leatherStyle(leather: OpenBookLeather): Record<string, string> {
  const def = LEATHERS[leather];
  return {
    "--ob-hide": def.tint,
    "--ob-leather-url": `url("${def.textureUrl}")`,
  };
}

/** Oxblood and walnut show the photographed hide as it is; the rest are tinted. */
export function leatherGrain(leather: OpenBookLeather): "natural" | "tinted" {
  return LEATHERS[leather].blend === "normal" ? "natural" : "tinted";
}
