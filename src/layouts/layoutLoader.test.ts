import { describe, it, expect } from "vitest";
import type { RouteLocationNormalized } from "vue-router";
import { layoutNameFor, layoutLoaders } from "./layoutLoader";

const meta = (m: Record<string, unknown>) =>
  m as RouteLocationNormalized["meta"];

/**
 * layoutNameFor duplicates the branch in App.vue's `layout` computed — the
 * router has to know which shell a route needs *before* App.vue renders it, so
 * the two cannot share one expression. If they drift, the router preloads one
 * chunk and App.vue then asks for a different one, reintroducing the very
 * blank-frame round trip the preload exists to remove.
 */
describe("layoutNameFor", () => {
  it("maps the auth and player metas to their own shells", () => {
    expect(layoutNameFor(meta({ layout: "auth" }))).toBe("auth");
    expect(layoutNameFor(meta({ layout: "player" }))).toBe("player");
  });

  it("falls back to the DM shell for an absent or unknown layout", () => {
    expect(layoutNameFor(meta({}))).toBe("default");
    expect(layoutNameFor(meta({ layout: undefined }))).toBe("default");
    expect(layoutNameFor(meta({ layout: "nonsense" }))).toBe("default");
  });

  it("exposes a loader for every name it can return", () => {
    for (const name of ["auth", "player", "default"] as const) {
      expect(typeof layoutLoaders[name]).toBe("function");
    }
  });
});
