import {
  DEFAULT_WIDGET_HEIGHT,
  defaultHeightFor,
  widgetById,
  type DashboardSurface,
  type DashboardWidgetId,
  type WidgetHeight,
  type WidgetWidth,
} from "./widgetCatalog";

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
  /**
   * How many half-widget rows this instance spans (#768). Absent means the
   * widget's own `defaultHeight` — so every layout written before heights
   * existed keeps rendering exactly as it did, without a migration.
   */
  height?: WidgetHeight;
  /**
   * Reserved headroom for per-instance widget config — written as absent by
   * every layout today. Exists so the first configurable widget (the
   * DM-screen quick card, #764) needs no jsonb shape migration: it can start
   * writing this field the day it ships, and `parseDashboardLayout` /
   * `mergeDashboardLayout` (see `savedLayout.ts`) already round-trip it.
   */
  settings?: Record<string, unknown>;
}

export interface DashboardLayout {
  widgets: DashboardLayoutEntry[];
  /**
   * Whether this surface packs its grid densely (#768).
   *
   * Off by default and opt-in per surface, which is the whole point. CSS
   * `grid-auto-flow: dense` fills the holes that heights leave behind, but it
   * does so by letting a later small widget slide up past an earlier one — so
   * the rendered order stops matching the order the DM arranged, which is the
   * one thing #760 promised not to do. As something the DM *turns on* it stops
   * being the engine overriding them and becomes them trading order for
   * density, deliberately and reversibly.
   *
   * Lives on the layout rather than in `useUiStore` because it is part of the
   * arrangement: it persists per user × campaign × surface with everything
   * else, and Reset clears it along with the rest.
   */
  dense?: boolean;
  /**
   * Every widget id the registry offered at the moment this layout was
   * saved. Without it, a widget id missing from `widgets` is ambiguous: it
   * could be one the DM deliberately removed in Customize mode (#763 gives
   * every widget a remove control), or one that shipped after they last saved.
   * Treating the first case like the second would make removal impossible;
   * treating the second like the first would make every future widget
   * undiscoverable. `known` is what lets `mergeDashboardLayout` tell them
   * apart — see `savedLayout.ts`. Absent on `DEFAULT_LAYOUTS`, which needs no
   * reconciling, and on any row written before the field existed; the merge
   * reads that absence as "it knew about everything", so nothing is re-added
   * and every gap is taken for a deliberate removal.
   */
  known?: DashboardWidgetId[];
}

/**
 * Heights are resolved here rather than left absent, so every entry the view
 * ever sees carries a concrete one exactly as it carries a concrete width.
 * `DashboardView` reads `DEFAULT_LAYOUTS` directly on Reset, so "the merge
 * will fill it in" would not have covered that path.
 */
const entry = (id: DashboardWidgetId, width: WidgetWidth): DashboardLayoutEntry => {
  const widget = widgetById(id);
  return {
    key: id,
    id,
    width,
    // Unreachable — every id here is a literal from the registry's own union —
    // but a default layout silently missing a height would be a bad way to
    // find out otherwise.
    height: widget === undefined ? DEFAULT_WIDGET_HEIGHT : defaultHeightFor(widget),
  };
};

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
