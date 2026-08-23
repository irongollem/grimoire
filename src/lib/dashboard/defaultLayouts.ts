import type { DashboardSurface, DashboardWidgetId, WidgetWidth } from "./widgetCatalog";

/**
 * Default layouts — today's two hand-written compositions, expressed as data.
 *
 * Order in `widgets` is render order. `key` exists because the catalogue is
 * not restricted to singletons forever: a future DM-screen widget clips
 * several reference cards at once, so identity has to be something other
 * than the widget id. Every widget here is `maxInstances: 1`, so `key`
 * equals `id` throughout — but `v-for` keys on `key`, not `id`, so that stays
 * true when a multi-instance widget arrives.
 */
export interface DashboardLayoutEntry {
  key: string;
  id: DashboardWidgetId;
  width: WidgetWidth;
}

export interface DashboardLayout {
  widgets: DashboardLayoutEntry[];
}

const entry = (id: DashboardWidgetId, width: WidgetWidth): DashboardLayoutEntry => ({
  key: id,
  id,
  width,
});

export const DEFAULT_LAYOUTS: Record<DashboardSurface, DashboardLayout> = {
  // The one sanctioned visual diff from today: the third cell used to stack
  // NextSessionWidget above UnidentifiedWidget in a nested flex column. The
  // flat layout model renders them as two adjacent cells instead — the 4th
  // cell wraps onto a second grid row rather than nesting inside the 3rd.
  prep: {
    widgets: [
      entry("prep-gaps", "cell"),
      entry("quests", "cell"),
      entry("next-session", "cell"),
      entry("unidentified", "cell"),
      entry("party", "full"),
      entry("pinned-notes", "full"),
      entry("stats", "full"),
    ],
  },
  session: {
    widgets: [
      entry("live-encounter", "full"),
      entry("party", "full"),
      entry("quests", "cell"),
      entry("session", "cell"),
      entry("unidentified", "cell"),
      entry("recent-npcs", "full"),
      entry("pinned-notes", "full"),
      entry("stats", "full"),
    ],
  },
};
