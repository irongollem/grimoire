import { THEMES } from "@/lib/themes";
import { activeThemeId, initTheme, setOverride, setTheme, themeOverrideState } from "@/lib/themeRuntime";

/** Expose shared theme state and controls for campaign themes and player overrides. */
export function useTheme() {
  return {
    activeThemeId,
    themeOverride: themeOverrideState,
    themes: THEMES,
    setTheme,
    setOverride,
    initTheme,
  };
}
