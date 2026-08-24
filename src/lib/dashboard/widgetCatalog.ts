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
  | "stats"
  | "dm-screen-card"
  | "roll-table"
  | "conditions"
  | "latest-session-note"
  | "quick-dice"
  | "death-saves"
  | "table-vitals"
  | "downtime-queue"
  | "quest-loot"
  | "upcoming-events"
  | "jump-to"
  | "quick-create"
  | "rule-tracker";

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
   * same catalogue as the session dashboard. The prep/session split that
   * exists today lives only in which widgets `DEFAULT_LAYOUTS` happens to
   * include, not in a widget's own eligibility.
   */
  surfaces: readonly DashboardSurface[];
  /**
   * How many copies of this widget one surface may hold. 1 for everything the
   * dashboard shipped with; `dm-screen-card` is the first to want more, since
   * a DM screen is several reference tables at once by definition.
   */
  maxInstances: number;
  /** Renders nothing when its data is empty — the shelf should say so. */
  selfHiding?: true;
  /**
   * The instance carries per-instance `settings` (#764), so Customize mode
   * offers it a gear and `WIDGET_SETTINGS_COMPONENTS`
   * (components/dashboard/widgetComponents.ts) must hold an editor for it —
   * `widgetComponents.test.ts` asserts both halves of that, in both directions.
   *
   * A flag rather than "does an editor exist", because this file is
   * deliberately free of component imports: the registry has to be able to say
   * a widget is configurable without being able to see the editor.
   */
  configurable?: true;
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
  {
    id: "dm-screen-card",
    title: "DM screen card",
    description: "One reference table from the DM screen — pick which, add as many as you like.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    // Six, because that is roughly what a physical four-panel screen holds
    // before it stops being scannable. Not a technical limit — a cap on how
    // far a DM can bury the rest of the dashboard under reference tables.
    maxInstances: 6,
    configurable: true,
  },
  {
    id: "roll-table",
    title: "Roll a table",
    description: "Roll one of your saved tables without leaving the dashboard.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    // Fewer than the DM screen card: a roll table is a thing you reach for a
    // few times a session, not a reference you read continuously.
    maxInstances: 4,
    configurable: true,
  },
  {
    id: "conditions",
    title: "Conditions",
    description: "All sixteen conditions, with the rules text one tap away.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "rule-tracker",
    title: "Rule tracker",
    description: "A homebrew rule's tracker, live for the whole party, with its DM buttons.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    // Four, like the roll table: a campaign running Sanity plausibly also
    // runs Corruption and Exposure, and one card each is the honest shape.
    maxInstances: 4,
    configurable: true,
  },
  {
    id: "jump-to",
    title: "Jump to…",
    description: "Search notes, NPCs, monsters, spells and items without leaving the board.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "quick-create",
    title: "Quick create",
    description: "Start a new NPC, quest, note, encounter or location.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "upcoming-events",
    title: "Upcoming events",
    description: "What is coming up on the in-world calendar, with a countdown to deadlines.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "quest-loot",
    title: "Unclaimed loot",
    description: "Quest rewards computed but never handed out.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "downtime-queue",
    title: "Downtime queue",
    description: "Player downtime draws waiting on you to resolve.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
    // Not self-hiding, unlike Table Vitals: an empty downtime queue is the
    // *good* state and worth saying out loud. "Every draw has been resolved"
    // is information; a card that vanished would leave the DM wondering
    // whether they had checked.
  },
  {
    id: "table-vitals",
    title: "Table vitals",
    description: "Remaining spell slots, class resources and concentration, at a glance.",
    widths: LIST_WIDTHS,
    // Wider than the other list widgets by default: a row can carry a name, a
    // concentration badge, several slot pills and several resource pills at
    // once, and at one column those wrap into a paragraph.
    defaultWidth: "wide",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
    // Only ever empty for a party with no casters, no class resources and
    // nobody concentrating — a stable fact about that party rather than a
    // passing one, so the card would sit there empty forever. The shelf says
    // it "appears on its own once it has something to show".
    selfHiding: true,
  },
  {
    id: "death-saves",
    title: "Death saves",
    description: "Appears only while someone is dying — successes, failures, how close to either end.",
    // All three widths, though the card is never more than a few rows. The
    // executor argued `full` was pointless for so little content; the DM can
    // still want this one shouting across the board, and a width they cannot
    // choose is a width the widget decided for them.
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
    selfHiding: true,
  },
  {
    id: "quick-dice",
    title: "Dice roller",
    description: "Standard dice or a typed expression, rolled on the spot.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
  {
    id: "latest-session-note",
    title: "Last session",
    description: "The most recent session recap, one tap from the board.",
    widths: LIST_WIDTHS,
    defaultWidth: "cell",
    surfaces: BOTH_SURFACES,
    maxInstances: 1,
  },
];

const BY_ID: ReadonlyMap<string, DashboardWidgetDef> = new Map(
  DASHBOARD_WIDGETS.map((widget) => [String(widget.id), widget]),
);

/**
 * The catalogue entry for an id, or `undefined` for one this build has never
 * heard of — which is an ordinary outcome, not an error: a saved layout can
 * name a widget a later deploy removed.
 *
 * Lives here because three modules had each built this same Map privately
 * (`savedLayout`, `arrangeOps`, `DashboardView`), and three copies of a lookup
 * over one registry is three places for a normalization step to land in only
 * two of them.
 */
export function widgetById(id: string): DashboardWidgetDef | undefined {
  return BY_ID.get(id);
}
