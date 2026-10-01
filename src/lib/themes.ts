/**
 * Grimoire theme definitions.
 *
 * Each theme maps CSS custom property names to their values.
 * These are applied to :root at runtime via document.documentElement.style.setProperty(),
 * which overrides the static :root fallback in main.css.
 *
 * To add a new theme: copy an existing entry, change the values, add it to THEMES.
 * The theme picker (when built) will read THEMES automatically.
 */

import { VELLUM, VELLUM_LAMPLIGHT } from "./themes.vellum";

export interface GrimoireTheme {
  /** Internal key — stored in localStorage */
  id: string;
  /** Display name shown in the theme picker */
  label: string;
  /**
   * Themes come in light/dark pairs that share a look. The player's
   * light/dark/system override picks the member of the campaign theme's family
   * rather than always jumping to tome/grimoire.
   */
  family: string;
  mode: "light" | "dark";
  /** CSS custom property values applied to :root */
  vars: Record<string, string>;
}

export const THEMES: GrimoireTheme[] = [
  // Vellum first: it is the default, and pickers list themes in this order.
  VELLUM,
  VELLUM_LAMPLIGHT,

  {
    id: "grimoire",
    label: "Grimoire (Dark)",
    family: "classic",
    mode: "dark",
    vars: {
      "--background":            "hsl(222 47% 7%)",
      "--foreground":            "hsl(38 60% 88%)",
      "--card":                  "hsl(222 40% 10%)",
      "--card-foreground":       "hsl(38 60% 88%)",
      "--popover":               "hsl(222 40% 10%)",
      "--popover-foreground":    "hsl(38 60% 88%)",
      "--primary":               "hsl(42 90% 42%)",
      "--primary-foreground":    "hsl(222 47% 7%)",
      "--secondary":             "hsl(340 50% 18%)",
      "--secondary-foreground":  "hsl(38 60% 88%)",
      "--muted":                 "hsl(222 30% 15%)",
      "--muted-foreground":      "hsl(38 30% 65%)",
      "--accent":                "hsl(42 90% 42%)",
      "--accent-foreground":     "hsl(222 47% 7%)",
      "--destructive":           "hsl(0 72% 51%)",
      "--destructive-foreground":"hsl(38 60% 88%)",
      "--border":                "hsl(222 30% 18%)",
      "--input":                 "hsl(222 30% 18%)",
      "--ring":                  "hsl(42 90% 42%)",
      "--radius":                "0.5rem",
    },
  },

  {
    id: "tome",
    label: "Tome (Light)",
    family: "classic",
    mode: "light",
    vars: {
      "--background":            "hsl(40 30% 95%)",
      "--foreground":            "hsl(222 40% 14%)",
      "--card":                  "hsl(0 0% 100%)",
      "--card-foreground":       "hsl(222 40% 14%)",
      "--popover":               "hsl(0 0% 100%)",
      "--popover-foreground":    "hsl(222 40% 14%)",
      "--primary":               "hsl(42 90% 35%)",
      "--primary-foreground":    "hsl(0 0% 100%)",
      "--secondary":             "hsl(340 30% 88%)",
      "--secondary-foreground":  "hsl(222 40% 14%)",
      "--muted":                 "hsl(38 15% 90%)",
      "--muted-foreground":      "hsl(222 20% 42%)",
      "--accent":                "hsl(42 90% 35%)",
      "--accent-foreground":     "hsl(0 0% 100%)",
      "--destructive":           "hsl(0 72% 45%)",
      "--destructive-foreground":"hsl(0 0% 100%)",
      "--border":                "hsl(38 15% 78%)",
      "--input":                 "hsl(38 15% 78%)",
      "--ring":                  "hsl(42 90% 35%)",
      "--radius":                "0.5rem",
    },
  },

  // Add new themes here — a colour-only theme needs no CSS, just a new entry.
];

/** The house theme: new campaigns, campaigns with no theme, and screens shown
 *  before any campaign is loaded. Tome and Grimoire stay selectable. */
export const DEFAULT_THEME_ID = "vellum";
