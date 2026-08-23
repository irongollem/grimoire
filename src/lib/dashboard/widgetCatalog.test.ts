import { describe, expect, it } from "vitest";
import { DASHBOARD_WIDGETS } from "./widgetCatalog";
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
