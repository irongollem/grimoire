import { ref, readonly } from "vue";
import { THEMES, DEFAULT_THEME_ID } from "@/lib/themes";
import type { GrimoireTheme } from "@/lib/themes";

const STORAGE_KEY = "grimoire-theme";
/** The two colours index.html's static boot splash paints with before any
 *  script or stylesheet has loaded. Its inline script reads this key by name,
 *  so the two must change together. */
export const SPLASH_COLORS_KEY = "grimoire-splash-colors";
const OVERRIDE_KEY = "grimoire-theme-override";

export type ThemeOverride = "campaign" | "light" | "dark" | "system";

const ls = typeof localStorage !== "undefined" ? localStorage : null;

const activeId = ref<string>(ls?.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID);
/** The theme the campaign asked for, before the player's override. STORAGE_KEY
 *  holds the *applied* theme, so re-resolving from it would compound overrides:
 *  "dark" then "light" must land on the campaign's light member, which the
 *  applied dark id alone cannot tell apart from a dark campaign theme. */
const CAMPAIGN_KEY = "grimoire-campaign-theme";
const campaignThemeId = ref<string>(
  ls?.getItem(CAMPAIGN_KEY) ?? ls?.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID,
);

const themeOverride = ref<ThemeOverride>(
  (ls?.getItem(OVERRIDE_KEY) as ThemeOverride) ?? "campaign",
);

/**
 * The member of `themeId`'s family in the given mode: a player who prefers dark
 * on a Vellum campaign gets Vellum Lamplight, not Grimoire. Falls back to the
 * classic pair for an unknown id.
 */
export function themeInMode(themeId: string, mode: "light" | "dark"): string {
  const family = THEMES.find((t) => t.id === themeId)?.family ?? "classic";
  return (
    THEMES.find((t) => t.family === family && t.mode === mode)?.id ??
    (mode === "dark" ? "grimoire" : "tome")
  );
}

function systemMode(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveThemeId(campaignThemeId: string): string {
  switch (themeOverride.value) {
    case "light":  return themeInMode(campaignThemeId, "light");
    case "dark":   return themeInMode(campaignThemeId, "dark");
    case "system": return themeInMode(campaignThemeId, systemMode());
    default:       return campaignThemeId;
  }
}

/** Every custom property any theme sets, so a switch can clear the ones the
 *  next theme leaves out. Vellum sets the tones and ramps inline; without this
 *  they would stay painted over tome's :root values after switching back. */
const ALL_THEME_PROPS = new Set(THEMES.flatMap((t) => Object.keys(t.vars)));

function applyTheme(theme: GrimoireTheme) {
  const root = document.documentElement;
  for (const prop of ALL_THEME_PROPS) {
    if (!(prop in theme.vars)) root.style.removeProperty(prop);
  }
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
  root.setAttribute("data-theme", theme.id);
  localStorage.setItem(STORAGE_KEY, theme.id);
  localStorage.setItem(
    SPLASH_COLORS_KEY,
    JSON.stringify({ background: theme.vars["--background"], primary: theme.vars["--primary"] }),
  );
  activeId.value = theme.id;
}

export function useTheme() {
  /** Set theme — respects the player override if active. */
  function setTheme(id: string) {
    campaignThemeId.value = id;
    localStorage.setItem(CAMPAIGN_KEY, id);
    const resolved = resolveThemeId(id);
    const theme = THEMES.find((t) => t.id === resolved);
    if (theme) applyTheme(theme);
  }

  function setOverride(override: ThemeOverride) {
    themeOverride.value = override;
    localStorage.setItem(OVERRIDE_KEY, override);
    // Re-apply with the campaign's theme — the override will resolve it
    setTheme(campaignThemeId.value);
  }

  /** Call once at app startup to restore the saved theme. */
  function initTheme() {
    setTheme(campaignThemeId.value);

    // Listen for system preference changes when in "system" mode
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (themeOverride.value === "system") {
        const theme = THEMES.find((t) => t.id === themeInMode(campaignThemeId.value, systemMode()));
        if (theme) applyTheme(theme);
      }
    });
  }

  return {
    activeThemeId: readonly(activeId),
    themeOverride: readonly(themeOverride),
    themes: THEMES,
    setTheme,
    setOverride,
    initTheme,
  };
}
