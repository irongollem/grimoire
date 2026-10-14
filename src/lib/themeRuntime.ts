import { ref, readonly } from "vue";
import { THEMES, DEFAULT_THEME_ID } from "@/lib/themes";
import type { GrimoireTheme } from "@/lib/themes";
import { safeLocalStorage } from "@/lib/safeLocalStorage";

// The theme runtime: module-level state plus the functions that apply it to the
// document. Pinia stores need to set and read the theme and must not import a
// composable, so the state lives here and `useTheme` is a thin wrapper over it.

const STORAGE_KEY = "grimoire-theme";
/** The two colours index.html's static boot splash paints with before any
 *  script or stylesheet has loaded. Its inline script reads this key by name,
 *  so the two must change together. */
export const SPLASH_COLORS_KEY = "grimoire-splash-colors";
const OVERRIDE_KEY = "grimoire-theme-override";

/**
 * The player's own theme (maintainer, 14 Oct 2026: "let players pick just as a
 * DM can, but leave follow campaign in there"): `"campaign"` follows the DM's
 * choice, anything else is the id of the theme they picked. It replaced a
 * light/dark/system switch that only moved within the campaign's family, so a
 * player at a Tome table could never have Vellum.
 */
export type ThemeOverride = string;
export const FOLLOW_CAMPAIGN = "campaign";

const isThemeId = (id: string | null): id is string => id !== null && THEMES.some((t) => t.id === id);

const activeId = ref<string>(safeLocalStorage().getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID);
/** The theme the campaign asked for, before the player's override. STORAGE_KEY
 *  holds the *applied* theme, so re-resolving from it would compound overrides:
 *  "dark" then "light" must land on the campaign's light member, which the
 *  applied dark id alone cannot tell apart from a dark campaign theme. */
const CAMPAIGN_KEY = "grimoire-campaign-theme";
const campaignThemeId = ref<string>(
  safeLocalStorage().getItem(CAMPAIGN_KEY) ?? safeLocalStorage().getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID,
);

// Anything stored that is not a theme id (the light/dark/system values the old
// switch saved among them) follows the campaign.
const storedOverride = safeLocalStorage().getItem(OVERRIDE_KEY);
const themeOverride = ref<ThemeOverride>(isThemeId(storedOverride) ? storedOverride : FOLLOW_CAMPAIGN);

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

/** The dark member of `themeId`'s family (itself when already dark). */
export function darkTwinId(themeId: string): string {
  return themeInMode(themeId, "dark");
}

/**
 * The dark twin's custom properties, for a wrapper's inline `style`: the
 * subtree renders dark whatever the viewer's light/dark setting is.
 */
export function darkTwinStyle(themeId: string): Record<string, string> {
  const twin = darkTwinId(themeId);
  const theme = THEMES.find((t) => t.id === twin);
  return theme ? { ...theme.vars } : {};
}

/** The theme to apply: the player's own pick, else the campaign's. */
function resolveThemeId(campaignThemeId: string): string {
  return isThemeId(themeOverride.value) ? themeOverride.value : campaignThemeId;
}

/** Every custom property any theme sets, so a switch can clear the ones the
 *  next theme leaves out. Vellum sets the tones and ramps inline; without this
 *  they would stay painted over tome's :root values after switching back. */
const ALL_THEME_PROPS = new Set(THEMES.flatMap((t) => Object.keys(t.vars)));

/**
 * Apply the theme to the document, clearing stale custom properties, and save
 * its ID and boot-splash colours while updating the shared active theme ID.
 */
function applyTheme(theme: GrimoireTheme) {
  const root = document.documentElement;
  for (const prop of ALL_THEME_PROPS) {
    if (!(prop in theme.vars)) root.style.removeProperty(prop);
  }
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
  root.setAttribute("data-theme", theme.id);
  safeLocalStorage().setItem(STORAGE_KEY, theme.id);
  safeLocalStorage().setItem(
    SPLASH_COLORS_KEY,
    JSON.stringify({ background: theme.vars["--background"], primary: theme.vars["--primary"], mode: theme.mode }),
  );
  activeId.value = theme.id;
}

/** Set theme — respects the player override if active. */
export function setTheme(id: string) {
  campaignThemeId.value = id;
  safeLocalStorage().setItem(CAMPAIGN_KEY, id);
  const resolved = resolveThemeId(id);
  const theme = THEMES.find((t) => t.id === resolved);
  if (theme) applyTheme(theme);
}

/** Persist the player's override and immediately reapply the campaign theme. */
export function setOverride(override: ThemeOverride) {
  themeOverride.value = isThemeId(override) ? override : FOLLOW_CAMPAIGN;
  safeLocalStorage().setItem(OVERRIDE_KEY, themeOverride.value);
  // Re-apply with the campaign's theme — the override will resolve it
  setTheme(campaignThemeId.value);
}

/** Call once at app startup to restore the saved theme. */
export function initTheme() {
  setTheme(campaignThemeId.value);
}

/** The applied theme id, read-only. */
export const activeThemeId = readonly(activeId);
/** The theme the campaign asked for, before the player's own pick, read-only. */
export const campaignThemeIdState = readonly(campaignThemeId);
/** The player's own theme, or "campaign", read-only. */
export const themeOverrideState = readonly(themeOverride);
