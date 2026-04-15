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

export interface GrimoireTheme {
  /** Internal key — stored in localStorage */
  id: string;
  /** Display name shown in the theme picker */
  label: string;
  /** CSS custom property values applied to :root */
  vars: Record<string, string>;
}

export const THEMES: GrimoireTheme[] = [
  {
    id: "grimoire",
    label: "Grimoire (Dark)",
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

  // Add new themes here — no CSS changes needed, just a new entry.
];

export const DEFAULT_THEME_ID = "tome";
