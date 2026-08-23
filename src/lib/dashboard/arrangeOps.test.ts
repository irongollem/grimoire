import { describe, expect, it } from "vitest";
import {
  addWidget,
  configureEntry,
  cycleWidth,
  instanceKey,
  isDefaultLayout,
  moveEntry,
  removeEntry,
  shelfWidgets,
} from "./arrangeOps";
import { DEFAULT_LAYOUTS, type DashboardLayoutEntry } from "./defaultLayouts";
import { DASHBOARD_WIDGETS } from "./widgetCatalog";

/**
 * An id no catalogue issue will ever ship.
 *
 * These tests used to say `"roll-table"`, which read as safely fictional right
 * up until #764 shipped a widget by that name and three assertions inverted
 * silently. A stand-in for "the registry has dropped this" has to be something
 * nobody would plausibly name a widget.
 */
const RETIRED_WIDGET_ID = "widget-retired-in-a-later-deploy";


const prep = (): DashboardLayoutEntry[] =>
  DEFAULT_LAYOUTS.prep.widgets.map((entry) => ({ ...entry }));

const keys = (entries: readonly DashboardLayoutEntry[]) => entries.map((entry) => entry.key);

describe("moveEntry", () => {
  // The keyboard move, and the only one that exists as a function: a pointer
  // drag is spliced by Sortable and crosses arbitrary distance, which this
  // deliberate single step cannot express.
  it("moves a widget one place in each direction", () => {
    const before = prep();
    const down = moveEntry(before, "quests", 1);
    expect(keys(down.entries)).toEqual([
      "prep-gaps",
      "next-session",
      "quests",
      "unidentified",
      "party",
      "pinned-notes",
      "stats",
    ]);
    expect(keys(moveEntry(down.entries, "quests", -1).entries)).toEqual(keys(before));
  });

  // Clamped, not wrapped: an Arrow-Up on the first widget that teleported it to
  // the bottom is a keyboard user's worst surprise — they cannot see the whole
  // grid at once to notice where it went.
  it("clamps at both ends rather than wrapping", () => {
    const first = moveEntry(prep(), "prep-gaps", -1);
    expect(keys(first.entries)).toEqual(keys(prep()));
    expect(first.announcement).toContain("already first");

    const last = moveEntry(prep(), "stats", 1);
    expect(keys(last.entries)).toEqual(keys(prep()));
    expect(last.announcement).toContain("already last");
  });

  // The aria-live region is the only feedback a screen-reader user gets, so it
  // has to name the widget and say where it landed.
  it("announces the widget's title and its new position", () => {
    expect(moveEntry(prep(), "quests", 1).announcement).toBe("Quests moved to position 3 of 7.");
  });

  it("leaves an unknown key alone", () => {
    const result = moveEntry(prep(), "not-a-widget", 1);
    expect(keys(result.entries)).toEqual(keys(prep()));
    expect(result.announcement).toBe("");
  });

  // Customize mode keeps the previous layout as its undo snapshot; an in-place
  // edit would quietly rewrite that too and undo would restore the new state.
  it("never mutates the array it was given", () => {
    const before = prep();
    const snapshot = keys(before);
    moveEntry(before, "quests", 1);
    expect(keys(before)).toEqual(snapshot);
  });
});

describe("cycleWidth", () => {
  it("advances through the widget's supported widths and wraps", () => {
    // `quests` supports cell → wide → full.
    let entries = prep();
    entries = cycleWidth(entries, "quests").entries;
    expect(entries.find((e) => e.key === "quests")?.width).toBe("wide");
    entries = cycleWidth(entries, "quests").entries;
    expect(entries.find((e) => e.key === "quests")?.width).toBe("full");
    entries = cycleWidth(entries, "quests").entries;
    expect(entries.find((e) => e.key === "quests")?.width).toBe("cell");
  });

  // Wrapping is right for a width cycle and clamping is right for a move: this
  // is one button pressed until the widget looks right, with no hidden state to
  // lose, so a dead end would just feel broken.
  it("says so rather than doing nothing for a single-width widget", () => {
    // `party` is full-only.
    const result = cycleWidth(prep(), "party");
    expect(result.entries.find((e) => e.key === "party")?.width).toBe("full");
    expect(result.announcement).toContain("one size");
  });

  it("announces the new width", () => {
    expect(cycleWidth(prep(), "quests").announcement).toBe("Quests set to wide width.");
  });
});

describe("removeEntry", () => {
  // Nothing is deleted — the widget returns to the shelf. Once per-instance
  // settings (#764) are real, a "remove" that destroyed configuration would be
  // unforgivable, so the wording has to be right from the start.
  it("takes the widget off the screen and says where it went", () => {
    const result = removeEntry(prep(), "stats");
    expect(keys(result.entries)).not.toContain("stats");
    expect(result.entries).toHaveLength(prep().length - 1);
    expect(result.announcement).toBe("Campaign stats removed to the shelf.");
  });

  it("is a no-op for a widget that is not there", () => {
    expect(keys(removeEntry(prep(), "live-encounter").entries)).toEqual(keys(prep()));
  });
});

describe("addWidget", () => {
  // Appended, not anchored — the opposite of what the #762 merge does with a
  // newly shipped widget, and deliberately: there the app introduces something
  // unasked so it goes where it will be seen; here the DM just clicked it.
  it("puts a shelf widget at the end, at its default width", () => {
    const result = addWidget(prep(), "live-encounter", "prep");
    expect(keys(result.entries).at(-1)).toBe("live-encounter");
    expect(result.entries.at(-1)?.width).toBe("full");
    expect(result.announcement).toBe("Live encounter added at position 8.");
  });

  it("refuses a widget already at its instance limit", () => {
    const result = addWidget(prep(), "quests", "prep");
    expect(keys(result.entries)).toEqual(keys(prep()));
    expect(result.announcement).toContain("already on this dashboard");
  });

  it("refuses an unknown widget id", () => {
    expect(keys(addWidget(prep(), RETIRED_WIDGET_ID, "prep").entries)).toEqual(keys(prep()));
  });

  // Derived from the registry rather than hard-coded, so it starts
  // discriminating for real the day a single-surface widget is added.
  it("refuses a widget the surface does not offer", () => {
    const offered = DASHBOARD_WIDGETS.filter((w) => w.surfaces.includes("prep")).map((w) => w.id);
    const notOffered = DASHBOARD_WIDGETS.filter((w) => !w.surfaces.includes("prep"));
    for (const widget of notOffered) {
      expect(keys(addWidget([], widget.id, "prep").entries)).toEqual([]);
    }
    // All ten widgets are dual-surface today, so the loop above is empty; this
    // asserts the premise so the test cannot quietly pass for the wrong reason.
    expect(offered.length + notOffered.length).toBe(DASHBOARD_WIDGETS.length);
  });

  it("keys a placed widget by its plain id", () => {
    expect(addWidget([], "quests", "prep").entries[0]?.key).toBe("quests");
  });
});

// Tested directly rather than through `addWidget`, which cannot reach the
// suffix branch while every widget is maxInstances 1. #764's DM-screen quick
// card is the first that will take a second instance, and an untested branch
// is one that will be wrong on the day it is first needed.
describe("instanceKey", () => {
  const at = (...keys: string[]): DashboardLayoutEntry[] =>
    keys.map((key) => ({ key, id: "quests", width: "cell" }));

  // `key` equals `id` for singletons so layouts stay readable and match what
  // DEFAULT_LAYOUTS writes.
  it("uses the plain id when it is free", () => {
    expect(instanceKey([], "quests")).toBe("quests");
    expect(instanceKey(at("party"), "quests")).toBe("quests");
  });

  it("suffixes from 2 upward, skipping keys already taken", () => {
    expect(instanceKey(at("quests"), "quests")).toBe("quests-2");
    expect(instanceKey(at("quests", "quests-2"), "quests")).toBe("quests-3");
    // A gap is filled rather than stepped over — the suffix is identity, not a
    // running count, so removing the 2nd of three must not strand the number.
    expect(instanceKey(at("quests", "quests-3"), "quests")).toBe("quests-2");
  });
});

/** One entry per instance slot on a surface, keyed the way `instanceKey` keys them. */
function everySlotFilled(surface: "prep" | "session"): DashboardLayoutEntry[] {
  return DASHBOARD_WIDGETS.filter((w) => w.surfaces.includes(surface)).flatMap((w) =>
    Array.from({ length: w.maxInstances }, (_unused, n) => ({
      key: n === 0 ? w.id : `${w.id}-${n + 1}`,
      id: w.id,
      width: w.defaultWidth,
    })),
  );
}

describe("shelfWidgets", () => {
  it("offers exactly what the layout has no room for", () => {
    const onShelf = shelfWidgets(prep(), "prep").map((w) => w.id);
    expect(onShelf).toContain("live-encounter");
    expect(onShelf).toContain("session");
    expect(onShelf).toContain("recent-npcs");
    expect(onShelf).not.toContain("quests");
    expect(onShelf).not.toContain("party");
  });

  it("offers everything when the dashboard is empty", () => {
    const offered = DASHBOARD_WIDGETS.filter((w) => w.surfaces.includes("session")).map((w) => w.id);
    expect(shelfWidgets([], "session").map((w) => w.id)).toEqual(offered);
  });

  // Every *slot* filled, not every widget placed once — `dm-screen-card` allows
  // six, and a shelf that dropped it after the first would make the other five
  // unreachable.
  it("is empty once every slot is filled", () => {
    expect(shelfWidgets(everySlotFilled("prep"), "prep")).toEqual([]);
  });

  it("keeps offering a multi-instance widget while it is under its cap", () => {
    const full = everySlotFilled("prep");
    const dropped = full.at(-1);
    expect(dropped, "no entries to drop").toBeDefined();
    if (dropped === undefined) return;
    // Freeing one slot of whichever widget owns the last one must put exactly
    // that widget back on the shelf, and nothing else.
    expect(shelfWidgets(full.slice(0, -1), "prep").map((w) => w.id)).toEqual([dropped.id]);
  });
});

describe("configureEntry", () => {
  it("stores a widget's settings on its own instance", () => {
    const before = addWidget(prep(), "dm-screen-card", "prep").entries;
    const after = configureEntry(before, "dm-screen-card", { tableId: "cover" });
    expect(after.entries.find((e) => e.key === "dm-screen-card")?.settings).toEqual({
      tableId: "cover",
    });
    expect(after.announcement).toBe("DM screen card settings updated.");
  });

  // The point of per-instance settings: two cards of the same widget, each
  // showing something different.
  it("leaves a sibling instance alone", () => {
    let entries = addWidget(prep(), "dm-screen-card", "prep").entries;
    entries = addWidget(entries, "dm-screen-card", "prep").entries;
    entries = configureEntry(entries, "dm-screen-card", { tableId: "cover" }).entries;
    entries = configureEntry(entries, "dm-screen-card-2", { tableId: "falling" }).entries;
    expect(entries.map((e) => e.settings?.tableId).filter(Boolean)).toEqual(["cover", "falling"]);
  });

  // Whole-blob, not a patch — otherwise a setting could never be unset.
  it("replaces the blob rather than merging into it", () => {
    const before = addWidget(prep(), "dm-screen-card", "prep").entries;
    const once = configureEntry(before, "dm-screen-card", { tableId: "cover", stale: 1 }).entries;
    const twice = configureEntry(once, "dm-screen-card", { tableId: "falling" }).entries;
    expect(twice.find((e) => e.key === "dm-screen-card")?.settings).toEqual({
      tableId: "falling",
    });
  });

  it("does not copy the caller's object into the layout", () => {
    const before = addWidget(prep(), "dm-screen-card", "prep").entries;
    const settings: Record<string, unknown> = { tableId: "cover" };
    const after = configureEntry(before, "dm-screen-card", settings).entries;
    settings.tableId = "mutated";
    expect(after.find((e) => e.key === "dm-screen-card")?.settings).toEqual({ tableId: "cover" });
  });

  it("is a no-op for a key that is not on the dashboard", () => {
    const before = prep();
    const after = configureEntry(before, "not-here", { tableId: "cover" });
    expect(after.entries).toEqual(before);
    expect(after.announcement).toBe("");
  });
});

describe("isDefaultLayout", () => {
  it("recognises each surface's own default", () => {
    expect(isDefaultLayout(prep(), "prep")).toBe(true);
    expect(isDefaultLayout(DEFAULT_LAYOUTS.session.widgets, "session")).toBe(true);
    expect(isDefaultLayout(prep(), "session")).toBe(false);
  });

  // A DM who only reordered the stock widgets has still customized their
  // screen; offering them "Reset to default" as a no-op would be a lie.
  it("counts a reorder or a resize as customized, not just a removal", () => {
    expect(isDefaultLayout(moveEntry(prep(), "quests", 1).entries, "prep")).toBe(false);
    expect(isDefaultLayout(cycleWidth(prep(), "quests").entries, "prep")).toBe(false);
    expect(isDefaultLayout(removeEntry(prep(), "stats").entries, "prep")).toBe(false);
  });

  // No default layout ships a configurable widget, so this cannot fire today.
  // It is here so that the day one does, Reset does not silently stop offering
  // itself to a DM who only changed which table a card shows.
  it("counts a settings change as customized", () => {
    const configured = configureEntry(prep(), "quests", { tableId: "cover" }).entries;
    expect(isDefaultLayout(configured, "prep")).toBe(false);
  });

  // Absent, empty and explicitly-undefined all mean "not configured"; a layout
  // must not differ from its own jsonb round trip.
  it("reads an empty settings blob as no settings at all", () => {
    const empty = prep().map((entry) => ({ ...entry, settings: {} }));
    expect(isDefaultLayout(empty, "prep")).toBe(true);
    const undef = prep().map((entry) => ({ ...entry, settings: { tableId: undefined } }));
    expect(isDefaultLayout(undef, "prep")).toBe(true);
  });
});
