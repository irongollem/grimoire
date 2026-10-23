import type { OpenBookLeather } from "@/types/openBook.types";
import { artUrl } from "@/lib/assets/artUrl";
import { LEATHERS } from "@/components/openBook/settings/leather";

/**
 * The hide a binding or cover is cut from. Oxblood and walnut are used as photographed; the green, blue and grey are
 * the brown grain tinted through `background-blend-mode: luminosity`, which keeps the grain's light and dark and
 * takes the hue from the tint. The cover and the binding around the pages share it.
 */
export function leatherStyle(leather: OpenBookLeather): Record<string, string> {
  const url = leather === "oxblood" ? artUrl("/assets/open-book/leather-oxblood.webp") : artUrl("/assets/open-book/leather.webp");
  return {
    "--ob-hide": LEATHERS[leather].color,
    "--ob-leather-url": `url("${url}")`,
  };
}

/** Oxblood and walnut show the photographed hide as it is; the rest are tinted. */
export function leatherGrain(leather: OpenBookLeather): "natural" | "tinted" {
  return leather === "oxblood" || leather === "walnut" ? "natural" : "tinted";
}
