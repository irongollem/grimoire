import { describe, it, expect } from "vitest";
import { editorLayerOf, exploreRoute, mapEditorRoute, placeRoute, startLayer } from "./placeRoute";

describe("placeRoute", () => {
  it("opens the place selected in the Atlas", () => {
    expect(placeRoute("abc")).toBe("/locations?at=abc");
  });

  it("escapes an id so it cannot add query parameters", () => {
    expect(placeRoute("a&edit=true")).toBe("/locations?at=a%26edit%3Dtrue");
  });

  it("opens it in a working state when asked", () => {
    expect(placeRoute("abc", "edit")).toBe("/locations?at=abc&edit=true");
  });

  // #1125 decision 9: the site's run layout retired; exploring is the Play screen at a path of its own, so a stale
  // `?run=true` link cannot mean anything and nothing builds one.
  it("sends 'explore' to the Play screen for the site, not to a flag on the Atlas", () => {
    expect(placeRoute("abc", "explore")).toBe("/locations/abc/explore");
  });

  // #1125 decision 1: Build is retired; the map is a path of its own, not a flag on the Atlas.
  it("sends 'map' to the full-screen editor, not to a flag on the Atlas", () => {
    expect(placeRoute("abc", "map")).toBe("/locations/abc/map");
  });
});

describe("exploreRoute", () => {
  it("escapes an id so it cannot add path segments", () => {
    expect(exploreRoute("a/b?x=1")).toBe("/locations/a%2Fb%3Fx%3D1/explore");
  });
});

describe("mapEditorRoute", () => {
  it("opens the place's editor, on a layer when one is asked for", () => {
    expect(mapEditorRoute("abc")).toBe("/locations/abc/map");
    expect(mapEditorRoute("abc", "zoning")).toBe("/locations/abc/map?layer=zoning");
  });

  it("escapes an id so it cannot add path segments", () => {
    expect(mapEditorRoute("a/b?layer=base")).toBe("/locations/a%2Fb%3Flayer%3Dbase/map");
  });
});

describe("startLayer", () => {
  // #1125 frame 04 and Map Table frame 18: a town's editor has only the Base image and Pins; a site's has the
  // Base image, Drawing and Zoning.
  it("keeps a layer the kind of place has", () => {
    expect(startLayer("zoning", true)).toBe("zoning");
    expect(startLayer("base", true)).toBe("base");
    expect(startLayer("pins", false)).toBe("pins");
  });

  it("falls back to the first layer for one the kind of place lacks", () => {
    expect(startLayer("pins", true)).toBe("drawing");
    expect(startLayer("zoning", false)).toBe("base");
    expect(startLayer("drawing", false)).toBe("base");
  });

  it("no longer understands the old names, so an old link falls back instead of opening the wrong tab", () => {
    expect(startLayer("plan", true)).toBe("drawing");
    expect(startLayer("picture", true)).toBe("drawing");
    expect(startLayer("picture", false)).toBe("base");
  });

  it("falls back for a missing, repeated or unknown value", () => {
    expect(startLayer(undefined, true)).toBe("drawing");
    expect(startLayer(["zoning", "base"], true)).toBe("drawing");
    expect(startLayer("nonsense", false)).toBe("base");
  });
});

describe("editorLayerOf", () => {
  it("names the workbench's tab for an address layer, and none for Pins", () => {
    expect(editorLayerOf("base")).toBe("picture");
    expect(editorLayerOf("drawing")).toBe("drawing");
    expect(editorLayerOf("zoning")).toBe("plan");
    expect(editorLayerOf("pins")).toBeUndefined();
  });
});
