import { describe, expect, it } from "vitest";
import { DASHBOARD_WIDGETS, defaultHeightFor, heightsFor } from "./widgetCatalog";
import { DEFAULT_LAYOUTS } from "./defaultLayouts";
import type { DashboardWidgetDef, DashboardWidgetId } from "./widgetCatalog";

const widgetById = new Map<DashboardWidgetId, DashboardWidgetDef>(
  DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]),
);

describe("DASHBOARD_WIDGETS", () => {
  it("has a unique id per widget", () => {
    const ids = DASHBOARD_WIDGETS.map((widget) => widget.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("lists a default width that is one of its own supported widths", () => {
    for (const widget of DASHBOARD_WIDGETS) {
      expect(widget.widths).toContain(widget.defaultWidth);
    }
  });
});

describe("DEFAULT_LAYOUTS", () => {
  it("references only known widget ids", () => {
    for (const layout of Object.values(DEFAULT_LAYOUTS)) {
      for (const placed of layout.widgets) {
        expect(widgetById.has(placed.id)).toBe(true);
      }
    }
  });

  it("only places a widget at a width it supports", () => {
    for (const layout of Object.values(DEFAULT_LAYOUTS)) {
      for (const placed of layout.widgets) {
        const def = widgetById.get(placed.id);
        expect(def?.widths).toContain(placed.width);
      }
    }
  });

  it("has a unique key per layout", () => {
    for (const layout of Object.values(DEFAULT_LAYOUTS)) {
      const keys = layout.widgets.map((placed) => placed.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("only places a widget on a surface it is offered on", () => {
    for (const [surface, layout] of Object.entries(DEFAULT_LAYOUTS)) {
      for (const placed of layout.widgets) {
        const def = widgetById.get(placed.id);
        expect(def?.surfaces).toContain(surface);
      }
    }
  });

  it("never places a widget more times than its maxInstances allows", () => {
    for (const layout of Object.values(DEFAULT_LAYOUTS)) {
      const counts = new Map<DashboardWidgetId, number>();
      for (const placed of layout.widgets) {
        counts.set(placed.id, (counts.get(placed.id) ?? 0) + 1);
      }
      for (const [id, count] of counts) {
        const def = widgetById.get(id);
        expect(count).toBeLessThanOrEqual(def?.maxInstances ?? 0);
      }
    }
  });
});

describe("heights (#768)", () => {
  it("offers only real heights, and prefers one it offers", () => {
    for (const widget of DASHBOARD_WIDGETS) {
      const offered = heightsFor(widget);
      expect(offered.length, `"${widget.id}" offers no height`).toBeGreaterThan(0);
      for (const height of offered) {
        expect([1, 2, 3, 4], `"${widget.id}" offers height ${height}`).toContain(height);
      }
      // The trap this catches: declaring `heights: [1]` and leaving
      // `defaultHeight` at 2, which would default to a height the widget just
      // said it cannot render in.
      expect(offered, `"${widget.id}" prefers a height it does not offer`).toContain(
        defaultHeightFor(widget),
      );
    }
  });

  it("has no duplicate heights in an offer list", () => {
    for (const widget of DASHBOARD_WIDGETS) {
      const offered = heightsFor(widget);
      expect(new Set(offered).size, `"${widget.id}" repeats a height`).toBe(offered.length);
    }
  });
});

describe("heightsFor / defaultHeightFor", () => {
  const base = DASHBOARD_WIDGETS[0];

  it("offers every height for a widget with no opinion", () => {
    expect(heightsFor({ ...base, heights: undefined })).toEqual([1, 2, 3, 4]);
  });

  it("honours a declared range", () => {
    expect(heightsFor({ ...base, heights: [1, 2] })).toEqual([1, 2]);
  });

  // An empty list is a widget saying nothing, not a widget with no heights —
  // taking it literally would leave a card that cannot be sized at all.
  it("reads an empty range as no opinion", () => {
    expect(heightsFor({ ...base, heights: [] })).toEqual([1, 2, 3, 4]);
  });

  it("prefers the declared default when the widget offers it", () => {
    expect(defaultHeightFor({ ...base, heights: [1, 2], defaultHeight: 1 })).toBe(1);
  });

  // The trap: a default outside the widget's own range would size a card to a
  // height it just said it does not support.
  it("ignores a default the widget does not offer", () => {
    expect(defaultHeightFor({ ...base, heights: [3, 4], defaultHeight: 1 })).toBe(3);
  });

  it("falls back to a normal card, then to the first height offered", () => {
    expect(defaultHeightFor({ ...base, heights: undefined, defaultHeight: undefined })).toBe(2);
    expect(defaultHeightFor({ ...base, heights: [4], defaultHeight: undefined })).toBe(4);
  });
});


