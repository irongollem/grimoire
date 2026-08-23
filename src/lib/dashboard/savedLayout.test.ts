import { describe, expect, it } from "vitest";
import {
  KNOWN_WIDGET_IDS,
  mergeDashboardLayout,
  parseDashboardLayout,
} from "./savedLayout";
import { DEFAULT_LAYOUTS, type DashboardLayout, type DashboardLayoutEntry } from "./defaultLayouts";
import { DASHBOARD_WIDGETS, type DashboardSurface, type DashboardWidgetId } from "./widgetCatalog";

/**
 * An id no catalogue issue will ever ship.
 *
 * These tests used to say `"roll-table"`, which read as safely fictional right
 * up until #764 shipped a widget by that name and three assertions inverted
 * silently. A stand-in for "the registry has dropped this" has to be something
 * nobody would plausibly name a widget.
 */
const RETIRED_WIDGET_ID = "widget-retired-in-a-later-deploy";


const SURFACES = ["prep", "session"] as const satisfies readonly DashboardSurface[];

const keysOf = (widgets: readonly DashboardLayoutEntry[]) => widgets.map((entry) => entry.key);
const defaultKeys = (surface: DashboardSurface) => keysOf(DEFAULT_LAYOUTS[surface].widgets);

/** A saved layout built from a surface's defaults, minus some widgets. */
function savedWithout(surface: DashboardSurface, ...dropped: DashboardWidgetId[]): DashboardLayout {
  return {
    widgets: DEFAULT_LAYOUTS[surface].widgets
      .filter((entry) => !dropped.includes(entry.id))
      .map((entry) => ({ ...entry })),
    known: [...KNOWN_WIDGET_IDS],
  };
}

describe("parseDashboardLayout", () => {
  // A malformed row must behave exactly as a missing one, because the caller's
  // only fallback is the defaults. Anything else renders an empty dashboard.
  it.each([
    ["null", null],
    ["a number", 42],
    ["a string", '{"widgets":[]}'],
    ["an array", []],
    ["an object with no widgets", {}],
    ["a non-array widgets", { widgets: "party" }],
    ["a null entry", { widgets: [null] }],
    ["an entry with a non-string key", { widgets: [{ key: 1, id: "party" }] }],
    ["an entry with an empty key", { widgets: [{ key: "", id: "party" }] }],
    ["an entry with no id", { widgets: [{ key: "party" }] }],
  ])("reads %s as absent", (_label, value) => {
    expect(parseDashboardLayout(value)).toBeNull();
  });

  it("accepts a well-formed layout and keeps what the registry recognises", () => {
    expect(
      parseDashboardLayout({
        widgets: [
          { key: "quests", id: "quests", width: "wide" },
          { key: "party", id: "party", width: "full" },
        ],
        known: ["quests", "party"],
      }),
    ).toEqual({
      widgets: [
        { key: "quests", id: "quests", width: "wide" },
        { key: "party", id: "party", width: "full" },
      ],
      known: ["quests", "party"],
    });
  });

  // An id the registry has dropped is ordinary drift, not corruption — losing
  // the whole arrangement over one renamed widget would be the worse failure.
  it("drops an entry whose widget no longer exists, keeping the rest", () => {
    const parsed = parseDashboardLayout({
      widgets: [
        { key: "quests", id: "quests", width: "cell" },
        { key: RETIRED_WIDGET_ID, id: RETIRED_WIDGET_ID, width: "cell" },
        { key: "party", id: "party", width: "full" },
      ],
    });
    expect(keysOf(parsed?.widgets ?? [])).toEqual(["quests", "party"]);
  });

  it("keeps a settings object and discards one that is not an object", () => {
    const withSettings = parseDashboardLayout({
      widgets: [{ key: "quests", id: "quests", width: "cell", settings: { table: "rumors" } }],
    });
    expect(withSettings?.widgets[0]?.settings).toEqual({ table: "rumors" });

    const withJunk = parseDashboardLayout({
      widgets: [{ key: "quests", id: "quests", width: "cell", settings: "rumors" }],
    });
    expect(withJunk?.widgets[0]?.settings).toBeUndefined();
  });

  it("replaces a width that is not a string with the widget's default", () => {
    const parsed = parseDashboardLayout({ widgets: [{ key: "quests", id: "quests", width: 3 }] });
    expect(parsed?.widgets[0]?.width).toBe("cell");
  });

  it("filters known down to ids the registry still has, and tolerates its absence", () => {
    expect(
      parseDashboardLayout({ widgets: [], known: ["quests", RETIRED_WIDGET_ID, 7] })?.known,
    ).toEqual(["quests"]);
    expect(parseDashboardLayout({ widgets: [] })?.known).toBeUndefined();
  });
});

describe("mergeDashboardLayout with nothing saved", () => {
  it.each(SURFACES)("renders %s's default layout", (surface) => {
    const merged = mergeDashboardLayout(null, surface);
    expect(merged.widgets).toEqual([...DEFAULT_LAYOUTS[surface].widgets]);
    expect(merged.newWidgetIds).toEqual([]);
  });

  // Arrange mode drags these entries around and cycles their widths in place.
  // Sharing structure with DEFAULT_LAYOUTS would let one DM's dragging rewrite
  // the defaults for every surface in the tab.
  it.each(SURFACES)("hands back copies, not %s's own default objects", (surface) => {
    const before = defaultKeys(surface);
    const widthBefore = DEFAULT_LAYOUTS[surface].widgets[0]?.width;

    const merged = mergeDashboardLayout(null, surface);
    const first = merged.widgets[0];
    expect(first).toBeDefined();
    if (!first) return;
    first.width = first.width === "full" ? "cell" : "full";
    first.settings = { touched: true };
    merged.widgets.reverse();

    expect(defaultKeys(surface)).toEqual(before);
    expect(DEFAULT_LAYOUTS[surface].widgets[0]?.width).toBe(widthBefore);
    expect(DEFAULT_LAYOUTS[surface].widgets[0]?.settings).toBeUndefined();
  });
});

describe("mergeDashboardLayout case 1 — widgets the registry no longer offers", () => {
  // Derived from the registry rather than hard-coded: every widget is
  // dual-surface today, so this asserts nothing is dropped now, and starts
  // discriminating for real the day a single-surface widget is added — with
  // nobody having to remember to come back and edit it.
  it.each(SURFACES)("keeps only the widgets offered on %s", (surface) => {
    const everyWidget: DashboardLayout = {
      widgets: DASHBOARD_WIDGETS.map((widget) => ({
        key: widget.id,
        id: widget.id,
        width: widget.defaultWidth,
      })),
      known: [...KNOWN_WIDGET_IDS],
    };
    const expected = DASHBOARD_WIDGETS.filter((widget) => widget.surfaces.includes(surface)).map(
      (widget) => widget.id,
    );
    expect(mergeDashboardLayout(everyWidget, surface).widgets.map((e) => e.id)).toEqual(expected);
  });

  it("collapses two entries that claim the same key", () => {
    const saved: DashboardLayout = {
      widgets: [
        { key: "quests", id: "quests", width: "cell" },
        { key: "quests", id: "quests", width: "full" },
      ],
      known: [...KNOWN_WIDGET_IDS],
    };
    expect(mergeDashboardLayout(saved, "prep").widgets).toEqual([
      { key: "quests", id: "quests", width: "cell" },
    ]);
  });

  // A hand-edited or corrupt row must not be able to render ten Party widgets.
  it("drops instances beyond the widget's maxInstances", () => {
    const saved: DashboardLayout = {
      widgets: [
        { key: "party-a", id: "party", width: "full" },
        { key: "party-b", id: "party", width: "full" },
      ],
      known: [...KNOWN_WIDGET_IDS],
    };
    expect(keysOf(mergeDashboardLayout(saved, "prep").widgets)).toEqual(["party-a"]);
  });
});

describe("mergeDashboardLayout case 2 — widgets that shipped after the save", () => {
  // The whole point of the merge: a DM who arranged their screen in August
  // must still find out about the widget that ships in October.
  it("puts a widget the layout never knew about at its default position", () => {
    const saved = savedWithout("prep", "next-session");
    saved.known = KNOWN_WIDGET_IDS.filter((id) => id !== "next-session");

    const merged = mergeDashboardLayout(saved, "prep");
    expect(keysOf(merged.widgets)).toEqual(defaultKeys("prep"));
    expect(merged.newWidgetIds).toEqual(["next-session"]);
  });

  // Anchored, not appended — the foot of a long dashboard is exactly where a
  // new widget goes unnoticed.
  it("anchors to the front when nothing precedes it in the defaults", () => {
    const saved = savedWithout("prep", "prep-gaps");
    saved.known = KNOWN_WIDGET_IDS.filter((id) => id !== "prep-gaps");
    expect(keysOf(mergeDashboardLayout(saved, "prep").widgets)[0]).toBe("prep-gaps");
  });

  it("keeps two new widgets in their default order relative to each other", () => {
    const saved = savedWithout("prep", "quests", "next-session");
    saved.known = KNOWN_WIDGET_IDS.filter((id) => id !== "quests" && id !== "next-session");

    const merged = mergeDashboardLayout(saved, "prep");
    expect(keysOf(merged.widgets)).toEqual(defaultKeys("prep"));
    expect(merged.newWidgetIds).toEqual(["quests", "next-session"]);
  });

  // A new widget the surface's defaults leave off reaches the shelf only. It
  // must not force its way onto a screen the DM has already arranged.
  it("reports a new widget the defaults omit without putting it on screen", () => {
    const saved = savedWithout("prep");
    saved.known = KNOWN_WIDGET_IDS.filter((id) => id !== "live-encounter");

    const merged = mergeDashboardLayout(saved, "prep");
    expect(merged.newWidgetIds).toEqual(["live-encounter"]);
    expect(keysOf(merged.widgets)).toEqual(defaultKeys("prep"));
    expect(DEFAULT_LAYOUTS.prep.widgets.some((e) => e.id === "live-encounter")).toBe(false);
  });

  // The other half of `known`: absence from `widgets` while present in `known`
  // is a removal, and Arrange mode's remove control is worthless without this.
  it("leaves a widget the DM removed removed", () => {
    const merged = mergeDashboardLayout(savedWithout("prep", "stats"), "prep");
    expect(keysOf(merged.widgets)).toEqual(defaultKeys("prep").filter((key) => key !== "stats"));
    expect(merged.newWidgetIds).toEqual([]);
  });

  it("adds nothing when the layout does not say what it knew", () => {
    const saved: DashboardLayout = { widgets: [{ key: "quests", id: "quests", width: "cell" }] };
    const merged = mergeDashboardLayout(saved, "prep");
    expect(keysOf(merged.widgets)).toEqual(["quests"]);
    expect(merged.newWidgetIds).toEqual([]);
  });
});

describe("mergeDashboardLayout case 3 — widths", () => {
  // A `wide` entry for a full-only widget renders as a broken cell.
  it("snaps a width the widget does not support to its default", () => {
    const saved: DashboardLayout = {
      widgets: [
        { key: "party", id: "party", width: "wide" },
        { key: "quests", id: "quests", width: "nonsense" as never },
      ],
      known: [...KNOWN_WIDGET_IDS],
    };
    const merged = mergeDashboardLayout(saved, "prep");
    expect(merged.widgets[0]?.width).toBe("full");
    expect(merged.widgets[1]?.width).toBe("cell");
  });

  it("leaves a supported non-default width alone", () => {
    const saved: DashboardLayout = {
      widgets: [{ key: "quests", id: "quests", width: "wide" }],
      known: [...KNOWN_WIDGET_IDS],
    };
    expect(mergeDashboardLayout(saved, "prep").widgets[0]?.width).toBe("wide");
  });
});

describe("mergeDashboardLayout and per-instance settings", () => {
  // Reserved headroom for #764's configurable widgets: the shape has to survive
  // a round trip today, or the first widget to use it needs a migration.
  it("round-trips settings through parse and merge", () => {
    const parsed = parseDashboardLayout({
      widgets: [{ key: "quests", id: "quests", width: "cell", settings: { sort: "urgent" } }],
      known: [...KNOWN_WIDGET_IDS],
    });
    const merged = mergeDashboardLayout(parsed, "prep");
    expect(merged.widgets[0]?.settings).toEqual({ sort: "urgent" });
  });
});
