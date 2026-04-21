import { ref, readonly } from "vue";
import { THEMES, DEFAULT_THEME_ID } from "@/lib/themes";
import type { GrimoireTheme } from "@/lib/themes";

const STORAGE_KEY = "grimoire-theme";
const OVERRIDE_KEY = "grimoire-theme-override";

export type ThemeOverride = "campaign" | "light" | "dark" | "system";

const activeId = ref<string>(
  localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID,
);

const themeOverride = ref<ThemeOverride>(
  (localStorage.getItem(OVERRIDE_KEY) as ThemeOverride) ?? "campaign",
);

function resolveSystemTheme(): string {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "grimoire" : "tome";
}

function resolveThemeId(campaignThemeId: string): string {
  switch (themeOverride.value) {
    case "light":  return "tome";
    case "dark":   return "grimoire";
    case "system": return resolveSystemTheme();
    default:       return campaignThemeId;
  }
}

function applyTheme(theme: GrimoireTheme) {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(theme.vars)) {
    root.style.setProperty(prop, value);
  }
  root.setAttribute("data-theme", theme.id);
  localStorage.setItem(STORAGE_KEY, theme.id);
  activeId.value = theme.id;
}

export function useTheme() {
  /** Set theme — respects the player override if active. */
  function setTheme(id: string) {
    const resolved = resolveThemeId(id);
    const theme = THEMES.find((t) => t.id === resolved);
    if (theme) applyTheme(theme);
  }

  function setOverride(override: ThemeOverride) {
    themeOverride.value = override;
    localStorage.setItem(OVERRIDE_KEY, override);
    // Re-apply with current campaign theme — the override will resolve it
    const current = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
    setTheme(current);
  }

  /** Call once at app startup to restore the saved theme. */
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
    setTheme(saved);

    // Listen for system preference changes when in "system" mode
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (themeOverride.value === "system") {
        const theme = THEMES.find((t) => t.id === resolveSystemTheme());
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
