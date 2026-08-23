import {
  DASHBOARD_WIDGETS,
  widgetById,
  type DashboardSurface,
  type DashboardWidgetDef,
  type DashboardWidgetId,
  type WidgetWidth,
} from "./widgetCatalog";
import {
  DEFAULT_LAYOUTS,
  type DashboardLayout,
  type DashboardLayoutEntry,
} from "./defaultLayouts";

/**
 * Reading a saved dashboard layout (#762): parse what came back out of jsonb,
 * then reconcile it against the registry that exists *now*.
 *
 * Both halves are pure and live here rather than in the composable because
 * this is the part with the interesting behaviour. A layout is written once
 * and then read for months while the registry moves underneath it, so a saved
 * row is never quite a description of the current app — the reconciliation is
 * the feature, not a defensive afterthought.
 */

/** What a save stamps into `known`: every widget id the registry offers today. */
export const KNOWN_WIDGET_IDS: readonly DashboardWidgetId[] = DASHBOARD_WIDGETS.map((w) => w.id);

export interface MergedDashboardLayout {
  /** Render order, ready for `v-for`. Always a fresh array of fresh entries. */
  widgets: DashboardLayoutEntry[];
  /**
   * Widget ids the registry has gained since this layout was saved. Arrange
   * mode (#763) badges these "New" — both the ones this merge put on screen
   * and the ones that only reached the shelf.
   */
  newWidgetIds: DashboardWidgetId[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWidgetId(value: string): value is DashboardWidgetId {
  return widgetById(value) !== undefined;
}

/** A width the widget actually supports, or the one it prefers. */
function snapWidth(width: unknown, widget: DashboardWidgetDef): WidgetWidth {
  const supported = widget.widths.find((candidate) => candidate === width);
  return supported === undefined ? widget.defaultWidth : supported;
}

/**
 * Entries are handed to callers that mutate them — Arrange mode drags them
 * around and cycles their width — so nothing may share structure with
 * `DEFAULT_LAYOUTS` or with the query cache's copy of the saved row.
 */
function cloneEntry(entry: DashboardLayoutEntry): DashboardLayoutEntry {
  const copy: DashboardLayoutEntry = { key: entry.key, id: entry.id, width: entry.width };
  if (entry.settings !== undefined) copy.settings = { ...entry.settings };
  return copy;
}

/**
 * Shape-check a `dashboard_layouts.layout` blob. `null` means "unreadable",
 * and every caller treats that exactly as it treats a missing row: fall back
 * to the defaults.
 *
 * Validation lives here rather than in a jsonb check constraint on the table
 * because the definition of a valid entry *is* the widget registry, and the
 * registry is TypeScript. A SQL copy of it would drift the first time a widget
 * was added, and would then be a constraint that rejects correct data.
 */
export function parseDashboardLayout(value: unknown): DashboardLayout | null {
  if (!isPlainObject(value) || !Array.isArray(value.widgets)) return null;

  const widgets: DashboardLayoutEntry[] = [];
  for (const raw of value.widgets) {
    // A non-object entry, or one without the two fields that give it identity,
    // means the blob was not written by this app — distrust the whole row
    // rather than salvaging half a layout out of it.
    if (!isPlainObject(raw)) return null;
    const { key, id } = raw;
    if (typeof key !== "string" || key.length === 0) return null;
    if (typeof id !== "string") return null;

    // An id we no longer recognise is a different matter: that is a widget
    // removed or renamed since the save, which is ordinary drift rather than
    // corruption, so it drops out alone. Note the one sharp edge — a browser
    // running a stale bundle drops a widget its cached registry has not heard
    // of yet, and the next save from that browser makes the loss permanent.
    // Inherent to storing the arrangement rather than the diff; the window is
    // one deploy wide, and the cost is one widget's position.
    if (!isWidgetId(id)) continue;

    const widget = widgetById(id);
    if (widget === undefined) continue;

    const entry: DashboardLayoutEntry = { key, id, width: snapWidth(raw.width, widget) };
    if (isPlainObject(raw.settings)) entry.settings = raw.settings;
    widgets.push(entry);
  }

  const layout: DashboardLayout = { widgets };
  if (Array.isArray(value.known)) {
    // Ids the registry has since dropped are filtered out, which costs nothing:
    // `known` is only ever asked whether it contains an id that exists today.
    layout.known = value.known.filter(
      (id): id is DashboardWidgetId => typeof id === "string" && isWidgetId(id),
    );
  }
  return layout;
}

/**
 * Where a default entry belongs among the widgets that survived.
 *
 * Walks back through the default layout to the nearest earlier entry that is
 * on screen and lands directly after it, so a widget that ships first in the
 * defaults arrives first rather than at the bottom. Appending would be simpler
 * and would defeat the point: the foot of a long dashboard is exactly where a
 * new widget goes unnoticed, and being noticed is the whole reason this
 * insertion happens at all.
 */
function anchorIndex(
  defaults: readonly DashboardLayoutEntry[],
  defaultIndex: number,
  widgets: readonly DashboardLayoutEntry[],
): number {
  for (let i = defaultIndex - 1; i >= 0; i--) {
    const anchor = defaults[i];
    if (anchor === undefined) continue;
    const at = widgets.findIndex((entry) => entry.key === anchor.key);
    if (at !== -1) return at + 1;
  }
  return 0;
}

/**
 * Reconcile a saved layout with the registry, for one surface.
 *
 * Three ways a stored layout goes stale, and what each costs if handled wrong:
 *
 * 1. **A saved widget the registry no longer has** — dropped silently. It was
 *    removed or renamed by a deploy; there is nothing to render.
 * 2. **A registry widget the layout has never heard of** — inserted at its
 *    default position, and reported in `newWidgetIds`. This is the one that
 *    matters: a DM who arranged their screen in August must still find out
 *    about the roll-table widget that ships in October.
 * 3. **A width the widget does not support** — snapped to its `defaultWidth`,
 *    because a `wide` entry for a full-only widget renders as a broken cell.
 *
 * Case 2 turns on `known`, and that is the whole reason the field exists.
 * Arrange mode can *remove* a widget, so "absent from `widgets`" alone cannot
 * distinguish a deliberate removal from a widget that shipped later. Re-adding
 * the first would make removal impossible; hiding the second would make every
 * future widget undiscoverable. `known` says which of the two it is.
 */
export function mergeDashboardLayout(
  saved: DashboardLayout | null,
  surface: DashboardSurface,
): MergedDashboardLayout {
  const defaults = DEFAULT_LAYOUTS[surface].widgets;
  if (saved === null) return { widgets: defaults.map(cloneEntry), newWidgetIds: [] };

  const widgets: DashboardLayoutEntry[] = [];
  const placedKeys = new Set<string>();
  const placedPerWidget = new Map<DashboardWidgetId, number>();

  for (const entry of saved.widgets) {
    const widget = widgetById(entry.id);
    if (widget === undefined) continue; // case 1: gone from the registry
    if (!widget.surfaces.includes(surface)) continue; // case 1: not offered here
    if (placedKeys.has(entry.key)) continue; // a duplicated key is one widget

    // A corrupt or hand-edited row must not be able to render ten Party
    // widgets; the registry's own limit is the authority.
    const placed = placedPerWidget.get(widget.id) ?? 0;
    if (placed >= widget.maxInstances) continue;

    placedKeys.add(entry.key);
    placedPerWidget.set(widget.id, placed + 1);
    widgets.push({ ...cloneEntry(entry), width: snapWidth(entry.width, widget) }); // case 3
  }

  // A layout that does not say what the registry offered is read as having
  // known about all of it, so nothing is re-added and every absence is taken
  // for a deliberate removal. The tempting fallback — trust it to know only
  // what it contains — inverts the behaviour: it would mark all nine other
  // widgets new and shove the default ones back onto a screen the DM had
  // arranged. No such rows exist (`known` shipped with the table), so the
  // conservative reading costs nothing and cannot be reached by accident.
  const known = new Set<string>(saved.known ?? KNOWN_WIDGET_IDS);
  const newWidgetIds = DASHBOARD_WIDGETS.filter(
    (widget) => widget.surfaces.includes(surface) && !known.has(widget.id),
  ).map((widget) => widget.id);
  const isNew = new Set<DashboardWidgetId>(newWidgetIds);

  // Only widgets the surface's default layout ships *visible* are put on
  // screen. A new widget the defaults leave off reaches `newWidgetIds` alone,
  // so #763's shelf can offer it with a "New" badge without it forcing its way
  // onto a screen the DM has already arranged.
  for (const [index, candidate] of defaults.entries()) {
    if (!isNew.has(candidate.id)) continue;
    if (placedKeys.has(candidate.key)) continue;
    placedKeys.add(candidate.key);
    widgets.splice(anchorIndex(defaults, index, widgets), 0, cloneEntry(candidate));
  }

  return { widgets, newWidgetIds };
}
