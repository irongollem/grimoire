import {
  DASHBOARD_WIDGETS,
  defaultHeightFor,
  heightsFor,
  widgetById,
  type DashboardSurface,
  type DashboardWidgetDef,
} from "./widgetCatalog";
import { DEFAULT_LAYOUTS, type DashboardLayoutEntry } from "./defaultLayouts";

/**
 * The seven edits Customize mode (#763, #764, #768) can make to a layout, as
 * pure functions.
 *
 * Every one takes the current entries and returns new entries — no mutation,
 * no Vue, no Supabase.
 *
 * Note what is *not* here: continuous pointer-drag reordering. Sortable splices
 * `draft` itself through `v-model`, and the view only saves afterwards. That is
 * not an oversight to tidy up — a drag relocates a widget by however many
 * places the gesture crossed, which `moveEntry`'s deliberate ±1 step cannot
 * express. `moveEntry` is the *keyboard* move, and clamping is what makes it
 * safe for someone who cannot see the whole grid at once.
 *
 * It also keeps the hard part out of the component. Reordering, width cycling
 * and shelf membership are list arithmetic with awkward edges (the ends of the
 * list, a widget offered on one surface but not another, `maxInstances`), and
 * that arithmetic is far cheaper to get right against unit tests than against
 * a rendered grid.
 */

/** Announcement text for the `aria-live` region, so the keyboard path says
 *  what happened rather than leaving a screen-reader user to infer it. */
export interface ArrangeOutcome {
  entries: DashboardLayoutEntry[];
  announcement: string;
  /**
   * The instance this edit was *about*, for the view to keep on screen.
   *
   * The sighted counterpart to `announcement`. A screen-reader user is told
   * "Roll a table added at position 24"; everyone else got nothing at all, and
   * on a board long enough to scroll, adding a widget looked exactly like
   * clicking a button that did nothing — the widget was appended twenty rows
   * below the fold. Arrow-key moves have the same problem in the other
   * direction.
   *
   * Absent for `removeEntry`, which is the one edit with nothing left to look
   * at.
   */
  focusKey?: string;
}

function titleOf(entry: DashboardLayoutEntry): string {
  const widget = widgetById(entry.id);
  // A layout only ever holds ids the merge already validated, so this is
  // unreachable in practice — but falling back to the raw id keeps the
  // announcement honest instead of saying "undefined moved to position 3".
  return widget === undefined ? entry.id : widget.title;
}

/** Never mutate the caller's array: Customize mode holds the previous layout as
 *  its undo snapshot, and an in-place edit would quietly rewrite that too. */
const clone = (entries: readonly DashboardLayoutEntry[]): DashboardLayoutEntry[] =>
  entries.map((entry) => ({ ...entry }));

/**
 * Move one widget one position, by instance key.
 *
 * Deliberately clamps rather than wrapping. An Arrow-Up on the first widget
 * that teleported it to the bottom would be a keyboard user's worst surprise —
 * they cannot see the whole grid at once to notice where it went.
 */
export function moveEntry(
  entries: readonly DashboardLayoutEntry[],
  key: string,
  direction: -1 | 1,
): ArrangeOutcome {
  const from = entries.findIndex((entry) => entry.key === key);
  const moved = entries[from];
  if (from === -1 || moved === undefined) {
    return { entries: clone(entries), announcement: "" };
  }

  const to = from + direction;
  if (to < 0 || to >= entries.length) {
    return {
      entries: clone(entries),
      announcement: `${titleOf(moved)} is already ${direction === -1 ? "first" : "last"}.`,
    };
  }

  const next = clone(entries);
  const [lifted] = next.splice(from, 1);
  if (lifted !== undefined) next.splice(to, 0, lifted);
  return {
    entries: next,
    announcement: `${titleOf(moved)} moved to position ${to + 1} of ${next.length}.`,
    focusKey: key,
  };
}

/**
 * Advance a widget to its next supported width, wrapping at the end.
 *
 * Wrapping is right here and clamping was right above, because the two
 * controls answer different questions: a width cycle is one button the DM
 * presses until the widget looks right, and a dead end would just make it feel
 * broken. There is also no hidden state to lose — every width is visible.
 */
export function cycleWidth(
  entries: readonly DashboardLayoutEntry[],
  key: string,
): ArrangeOutcome {
  const index = entries.findIndex((entry) => entry.key === key);
  const entry = entries[index];
  if (index === -1 || entry === undefined) {
    return { entries: clone(entries), announcement: "" };
  }

  const widget = widgetById(entry.id);
  // A widget with a single supported width has no cycle to offer. Saying so is
  // better than a control that visibly does nothing.
  if (widget === undefined || widget.widths.length < 2) {
    return { entries: clone(entries), announcement: `${titleOf(entry)} has one size.` };
  }

  const at = widget.widths.indexOf(entry.width);
  const nextWidth = widget.widths[(at + 1) % widget.widths.length];
  if (nextWidth === undefined) return { entries: clone(entries), announcement: "" };

  const next = clone(entries);
  next[index] = { ...entry, width: nextWidth };
  return {
    entries: next,
    announcement: `${titleOf(entry)} set to ${nextWidth} width.`,
    focusKey: key,
  };
}

/**
 * Advance a widget to its next supported height, wrapping (#768).
 *
 * Wraps for the same reason `cycleWidth` does: it is one button pressed until
 * the card looks right, with no hidden state, so a dead end would just feel
 * broken.
 */
export function cycleHeight(
  entries: readonly DashboardLayoutEntry[],
  key: string,
): ArrangeOutcome {
  const index = entries.findIndex((entry) => entry.key === key);
  const entry = entries[index];
  if (index === -1 || entry === undefined) {
    return { entries: clone(entries), announcement: "" };
  }

  const widget = widgetById(entry.id);
  if (widget === undefined) return { entries: clone(entries), announcement: "" };

  const offered = heightsFor(widget);
  if (offered.length < 2) {
    return { entries: clone(entries), announcement: `${titleOf(entry)} has one height.` };
  }

  // An entry whose stored height is not on offer (a widget that narrowed its
  // range since the save) restarts from the widget's default rather than from
  // -1, which would land on the last height and read as random.
  const current = entry.height === undefined ? defaultHeightFor(widget) : entry.height;
  const at = offered.indexOf(current);
  const nextHeight = offered[(at === -1 ? offered.indexOf(defaultHeightFor(widget)) : at) + 1] ?? offered[0];

  const next = clone(entries);
  next[index] = { ...entry, height: nextHeight };
  return {
    entries: next,
    announcement: `${titleOf(entry)} set to ${nextHeight} of 4 height.`,
    focusKey: key,
  };
}

/**
 * Take a widget off the screen. Nothing is deleted — it returns to the shelf,
 * which is why the announcement says so: a control labelled "remove" that
 * silently destroyed a configured widget would be unforgivable, and since
 * #764 that is no longer hypothetical — a removed DM screen card is a table
 * the DM chose. Re-adding it from the shelf does start it fresh, though: the
 * entry is gone, and with it its `settings`.
 */
export function removeEntry(
  entries: readonly DashboardLayoutEntry[],
  key: string,
): ArrangeOutcome {
  const entry = entries.find((candidate) => candidate.key === key);
  if (entry === undefined) return { entries: clone(entries), announcement: "" };
  return {
    entries: clone(entries).filter((candidate) => candidate.key !== key),
    announcement: `${titleOf(entry)} removed to the shelf.`,
  };
}

/**
 * Replace one instance's per-widget settings (#764).
 *
 * Whole-blob replacement rather than a merge, because the editor for a widget
 * always emits the complete shape it owns. Merging would make a setting
 * impossible to *unset*, which is exactly the bug a settings dialog grows on
 * its second field.
 *
 * The announcement stays generic on purpose. Only the editor knows that
 * `{ tableId: "cover" }` means "Cover", and threading a per-widget describer
 * through here to say so would put widget vocabulary into the layout
 * arithmetic — the one thing this module has stayed free of.
 */
export function configureEntry(
  entries: readonly DashboardLayoutEntry[],
  key: string,
  settings: Record<string, unknown>,
): ArrangeOutcome {
  const index = entries.findIndex((entry) => entry.key === key);
  const entry = entries[index];
  if (index === -1 || entry === undefined) {
    return { entries: clone(entries), announcement: "" };
  }

  const next = clone(entries);
  next[index] = { ...entry, settings: { ...settings } };
  return {
    entries: next,
    announcement: `${titleOf(entry)} settings updated.`,
    focusKey: key,
  };
}

/**
 * Put a shelf widget on the screen, at the end where the DM is looking.
 *
 * Appended rather than anchored to its default position — the opposite of what
 * the #762 merge does with a newly shipped widget, and deliberately so. There
 * the app is introducing something unasked, so it goes where it will be seen;
 * here the DM asked for it, and putting it anywhere else would silently
 * reorder a board they arranged. Prepending is the tempting fix for "I can't
 * see it" and it is the wrong one: it demotes whatever the DM deliberately
 * put first, every single time, and adding three widgets stacks them at the
 * top in reverse.
 *
 * The visibility problem is real, though — on a long board the new widget
 * lands below the fold and adding it looks like nothing happened. That is
 * answered by `focusKey`, which the view scrolls to. Position is the model;
 * being seen is feedback; they are different problems and only one of them is
 * this function's.
 */
export function addWidget(
  entries: readonly DashboardLayoutEntry[],
  id: string,
  surface: DashboardSurface,
): ArrangeOutcome {
  const widget = widgetById(id);
  if (widget === undefined || !widget.surfaces.includes(surface)) {
    return { entries: clone(entries), announcement: "" };
  }

  const placed = entries.filter((entry) => entry.id === widget.id).length;
  if (placed >= widget.maxInstances) {
    return {
      entries: clone(entries),
      announcement: `${widget.title} is already on this dashboard.`,
    };
  }

  const next = clone(entries);
  const key = instanceKey(entries, widget.id);
  next.push({ key, id: widget.id, width: widget.defaultWidth });
  return {
    entries: next,
    announcement: `${widget.title} added at position ${next.length}.`,
    focusKey: key,
  };
}

/**
 * A key no entry is using.
 *
 * Equal to the widget id for the singleton case, which most widgets are — so
 * layouts stay readable and match what `DEFAULT_LAYOUTS` writes. Only a second
 * instance needs a suffix, and #764's DM-screen quick card is the first widget
 * that takes one: it is `maxInstances: 6`, because a screen with one table on
 * it is not a screen.
 *
 * Still exported, and still tested directly. `addWidget` now does reach the
 * suffix branch, but only through the one widget that allows a second
 * instance — a test that went through `addWidget` would be testing the quick
 * card's registry entry as much as this function.
 */
export function instanceKey(entries: readonly DashboardLayoutEntry[], id: string): string {
  const taken = new Set(entries.map((entry) => entry.key));
  if (!taken.has(id)) return id;
  for (let n = 2; ; n++) {
    const candidate = `${id}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * What the shelf offers: every widget this surface allows that the layout has
 * no room for, in catalogue order.
 *
 * Driven by `maxInstances` rather than mere presence, so a future
 * multi-instance widget stays on the shelf until its last slot is used instead
 * of vanishing the moment one is placed.
 */
export function shelfWidgets(
  entries: readonly DashboardLayoutEntry[],
  surface: DashboardSurface,
): DashboardWidgetDef[] {
  const placed = new Map<string, number>();
  for (const entry of entries) {
    placed.set(entry.id, (placed.get(entry.id) ?? 0) + 1);
  }
  return DASHBOARD_WIDGETS.filter(
    (widget) =>
      widget.surfaces.includes(surface) && (placed.get(widget.id) ?? 0) < widget.maxInstances,
  );
}

/**
 * The keys a settings blob actually carries. An explicitly-`undefined` value is
 * not a setting — it is what `JSON.stringify` would drop on the way to jsonb,
 * so treating it as one would make a layout differ from its own round trip.
 */
function settingKeys(settings: Record<string, unknown> | undefined): string[] {
  if (settings === undefined) return [];
  return Object.keys(settings)
    .filter((key) => settings[key] !== undefined)
    .sort();
}

/** Whether two instances are configured the same way. Absent and `{}` agree. */
function sameSettings(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): boolean {
  const aKeys = settingKeys(a);
  const bKeys = settingKeys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(
    (key, index) =>
      bKeys[index] === key &&
      JSON.stringify(a === undefined ? undefined : a[key]) ===
        JSON.stringify(b === undefined ? undefined : b[key]),
  );
}

/**
 * Whether this layout is already the surface's default.
 *
 * Compares the whole arrangement — order, widths, heights and per-instance settings,
 * not just membership — because a DM who only reordered the stock widgets has
 * still customized their screen, and offering them "Reset to default" as a
 * no-op would be a lie.
 *
 * Settings are compared as configuration rather than as objects: absent and
 * `{}` are the same thing, and so are two blobs whose keys were written in a
 * different order. No default layout ships a configurable widget today, so
 * this cannot currently fire — which is precisely why it is written now, while
 * the reasoning is in front of someone, rather than the first time a default
 * layout gains a DM screen card and Reset silently stops offering itself.
 */
export function isDefaultLayout(
  entries: readonly DashboardLayoutEntry[],
  surface: DashboardSurface,
): boolean {
  const defaults = DEFAULT_LAYOUTS[surface].widgets;
  if (entries.length !== defaults.length) return false;
  return entries.every((entry, index) => {
    const expected = defaults[index];
    return (
      expected !== undefined &&
      entry.key === expected.key &&
      entry.id === expected.id &&
      entry.width === expected.width &&
      entry.height === expected.height &&
      sameSettings(entry.settings, expected.settings)
    );
  });
}
