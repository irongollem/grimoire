import { describe, it, expect } from "vitest";
import { DASHBOARD_WIDGETS } from "@/lib/dashboard/widgetCatalog";
import { WIDGET_COMPONENTS, WIDGET_SETTINGS_COMPONENTS } from "./widgetComponents";

/**
 * The registry and the two component maps have to agree, and only one of the
 * three pairings is a type error on its own. `WIDGET_COMPONENTS` is a
 * `Record`, so a missing widget fails to compile; `WIDGET_SETTINGS_COMPONENTS`
 * is a `Partial` and cannot be, which is what these cover.
 */
describe("widget component maps", () => {
  it("renders every registered widget", () => {
    for (const widget of DASHBOARD_WIDGETS) {
      expect(WIDGET_COMPONENTS[widget.id], `no component for "${widget.id}"`).toBeDefined();
    }
  });

  // Customize mode shows a gear for `configurable` widgets; without an editor
  // that gear opens a dialog with nothing in it.
  it("gives every configurable widget a settings editor", () => {
    const configurable = DASHBOARD_WIDGETS.filter((w) => w.configurable === true).map((w) => w.id);
    expect(configurable.length).toBeGreaterThan(0);
    for (const id of configurable) {
      expect(WIDGET_SETTINGS_COMPONENTS[id], `no settings editor for "${id}"`).toBeDefined();
    }
  });

  // And the inverse, which is the easier mistake: an editor written for a
  // widget whose registry entry was never marked configurable is dead code the
  // DM has no control to reach.
  it("has no settings editor for a widget that is not configurable", () => {
    for (const id of Object.keys(WIDGET_SETTINGS_COMPONENTS)) {
      const widget = DASHBOARD_WIDGETS.find((w) => w.id === id);
      expect(widget, `settings editor for unknown widget "${id}"`).toBeDefined();
      expect(widget?.configurable, `"${id}" has an editor but is not configurable`).toBe(true);
    }
  });
});
