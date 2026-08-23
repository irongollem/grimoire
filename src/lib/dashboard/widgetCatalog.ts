/**
 * The dashboard's widget registry — pure metadata, no component imports.
 *
 * `DashboardView.vue` used to be the only registry the dashboard had: an
 * import list plus two hand-written `<template v-if>` compositions. That
 * meant the only way to add, move or resize a widget was to edit the view.
 * This module and `defaultLayouts.ts` turn "what widgets exist" and "what a
 * layout looks like" into data, so a future persistence layer can store a
 * layout and an Arrange mode can edit one (#762/#763). Kept apart from
 * `components/dashboard/widgetComponents.ts` — which maps ids to actual
 * components — so this stays unit-testable without mounting Vue at all
 * (module-placement rule: pure-logic modules don't reach into feature UI).
 */

export type DashboardSurface = "prep" | "session";
export type WidgetWidth = "cell" | "wide" | "full";

export type DashboardWidgetId =
  | "party"
  | "quests"
  | "session"
  | "unidentified"
  | "prep-gaps"
  | "next-session"
  | "recent-npcs"
  | "pinned-notes"
  | "live-encounter"
  | "stats";

export interface DashboardWidgetDef {
  id: DashboardWidgetId;
  /** Shelf label (Arrange mode, #763). */
  title: string;
  /** One line for the shelf. */
  description: string;
  widths: readonly WidgetWidth[];
  defaultWidth: WidgetWidth;
  /**
   * Every widget is offered on both surfaces — the prep dashboard offers the
   * same ten widgets as the session dashboard. The prep/session split that
   * exists today lives only in which widgets `DEFAULT_LAYOUTS` happens to
   * include, not in a widget's own eligibility.
   */
  surfaces: readonly DashboardSurface[];
  /** 1 for all ten existing widgets. */
  maxInstances: number;
  /** Renders nothing when its data is empty — the shelf should say so. */
  selfHiding?: true;
}

const BOTH_SURFACES: readonly DashboardSurface[] = ["prep", "session"];
const LIST_WIDTHS: readonly WidgetWidth[] = ["cell", "wide", "full"];
const FULL_ONLY: readonly WidgetWidth[] = ["full"];

export const DASHBOARD_WIDGETS: readonly DashboardWidgetDef[] = [
  {
    id: "prep-gaps",
    title: "Needs prep",
    description: "Quest beats that are not ready to run.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "quests",
    title: "Quests",
    description: "Every quest, one row each, most urgent first.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "session",
    title: "Session",
    description: "The in-world game day and the party's current location.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "unidentified",
    title: "Unidentified",
    description: "Party loot still waiting to be identified.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "next-session",
    title: "Next session",
    description: "Countdown to the next scheduled game.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "party",
    title: "Party",
    description: "The party roster at a glance.",
    widths: FULL_ONLY,
    defaultWidth: "full",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "recent-npcs",
    title: "Recent NPCs",
    description: "NPCs the DM has looked at lately.",
    widths: FULL_ONLY,
    defaultWidth: "full",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
    selfHiding: true,
  },
  {
    id: "pinned-notes",
    title: "Pinned notes",
    description: "Notes pinned for quick reference.",
    widths: FULL_ONLY,
    defaultWidth: "full",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
    selfHiding: true,
  },
  {
    id: "live-encounter",
    title: "Live encounter",
    description: "Live encounter banner — shows only while a combat is running.",
    widths: FULL_ONLY,
    defaultWidth: "full",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
    selfHiding: true,
  },
  {
    id: "stats",
    title: "Campaign stats",
    description: "Counts of quests, NPCs, encounters and locations.",
    widths: FULL_ONLY,
    defaultWidth: "full",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
];
