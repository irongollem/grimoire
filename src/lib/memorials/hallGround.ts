import { artUrl } from "@/lib/assets/artUrl";
import { darkTwinStyle } from "@/lib/themeRuntime";

/** The Hall's stone ground, a tileable texture served as a CDN art asset. */
export function hallStoneUrl(): string {
  return `url("${artUrl("/assets/memorial/stone.jpg")}")`;
}

/**
 * The style a layout shell takes on a `meta.darkChrome` route (the Hall of the Fallen): the
 * theme's dark twin, so the bars go dark with the wall, and the wall's stone as the shell's
 * own ground. Without the stone, vellum paints every `bg-background` with its paper tile, and
 * iOS's rubber-band scroll past either end of the wall showed that paper (7 Oct 2026). An
 * inline background outranks the theme's stylesheet rule.
 */
export function darkChromeStyle(themeId: string): Record<string, string> {
  return {
    ...darkTwinStyle(themeId),
    backgroundImage: hallStoneUrl(),
    backgroundSize: "24rem 24rem",
    backgroundRepeat: "repeat",
  };
}
