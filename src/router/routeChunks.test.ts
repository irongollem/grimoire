import { describe, it, expect } from "vitest";
import type { Router } from "vue-router";
import { prefetchRouteComponents } from "./routeChunks";

function routerResolving(resolved: unknown): Router {
  return { resolve: () => resolved } as unknown as Router;
}

describe("prefetchRouteComponents", () => {
  it("starts the lazy components only, and returns the resolved location", () => {
    let lazyCalls = 0;
    const lazy = () => {
      lazyCalls += 1;
      return Promise.resolve({});
    };
    const resolved = { meta: {}, matched: [{ components: { default: lazy, side: { setup() {} } } }] };
    expect(prefetchRouteComponents(routerResolving(resolved), "/npcs")).toBe(resolved);
    expect(lazyCalls).toBe(1);
  });

  it("returns null for a location the router cannot resolve", () => {
    const throwing = { resolve: () => { throw new Error("bad url"); } } as unknown as Router;
    expect(prefetchRouteComponents(throwing, "/%")).toBeNull();
  });
});
