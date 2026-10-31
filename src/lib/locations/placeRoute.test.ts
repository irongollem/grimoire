import { describe, it, expect } from "vitest";
import { exploreRoute, mapEditorRoute, placeRoute, startLayer } from "./placeRoute";

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
    expect(mapEditorRoute("abc", "plan")).toBe("/locations/abc/map?layer=plan");
  });

  it("escapes an id so it cannot add path segments", () => {
    expect(mapEditorRoute("a/b?layer=picture")).toBe("/locations/a%2Fb%3Flayer%3Dpicture/map");
  });
});

describe("startLayer", () => {
  // #1125 frame 04: a town's editor has only Picture and Pins; a site's has Drawing, Plan and Picture.
  it("keeps a layer the kind of place has", () => {
    expect(startLayer("plan", true)).toBe("plan");
    expect(startLayer("picture", true)).toBe("picture");
    expect(startLayer("pins", false)).toBe("pins");
  });

  it("falls back to the first layer for one the kind of place lacks", () => {
    expect(startLayer("pins", true)).toBe("drawing");
    expect(startLayer("plan", false)).toBe("picture");
    expect(startLayer("drawing", false)).toBe("picture");
  });

  it("falls back for a missing, repeated or unknown value", () => {
    expect(startLayer(undefined, true)).toBe("drawing");
    expect(startLayer(["plan", "picture"], true)).toBe("drawing");
    expect(startLayer("nonsense", false)).toBe("picture");
  });
});
