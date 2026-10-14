import { THEMES } from "@/lib/themes";
import { activeThemeId, campaignThemeIdState, FOLLOW_CAMPAIGN, initTheme, previewTheme, setOverride, setTheme, themeOverrideState } from "@/lib/themeRuntime";

/** Expose shared theme state and controls for campaign themes and player overrides. */
export function useTheme() {
  return {
    activeThemeId,
    campaignThemeId: campaignThemeIdState,
    themeOverride: themeOverrideState,
    followCampaign: FOLLOW_CAMPAIGN,
    themes: THEMES,
    setTheme,
    previewTheme,
    setOverride,
    initTheme,
  };
}
