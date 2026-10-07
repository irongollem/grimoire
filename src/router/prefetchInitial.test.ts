import { describe, it, expect, vi } from "vitest";
import type { RouteLocationResolved, Router } from "vue-router";

const preloadLayout = vi.fn((_to: unknown) => Promise.resolve());
vi.mock("@/layouts/layoutLoader", () => ({ preloadLayout: (to: unknown) => preloadLayout(to) }));

import { prefetchInitialChunks } from "./prefetchInitial";

function routerResolving(resolved: unknown): Router {
  return { resolve: () => resolved } as unknown as Router;
}

describe("prefetchInitialChunks", () => {
  it("starts the layout and every lazy component, but not eager components", () => {
    // vi.fn() mocks carry a prototype, so the loaders are counted by hand.
    let lazyCalls = 0;
    let eagerCalls = 0;
    const lazy = () => {
      lazyCalls += 1;
      return Promise.resolve({});
    };
    const eager = function eagerComponent() {
      eagerCalls += 1;
      return null;
    };
    const resolved = {
      meta: {},
      matched: [{ components: { default: lazy } }, { components: { default: eager, side: { setup() {} } } }],
    } as unknown as RouteLocationResolved;
    prefetchInitialChunks(routerResolving(resolved), "/dashboard");
    expect(preloadLayout).toHaveBeenCalledWith(resolved);
    expect(lazyCalls).toBe(1);
    expect(eagerCalls).toBe(0);
  });

  it("swallows a rejected chunk and a throwing resolve", async () => {
    const failing = () => Promise.reject(new Error("offline"));
    const resolved = { meta: {}, matched: [{ components: { default: failing } }] };
    expect(() => prefetchInitialChunks(routerResolving(resolved), "/x")).not.toThrow();
    await Promise.resolve();
    const throwing = { resolve: () => { throw new Error("bad url"); } } as unknown as Router;
    expect(() => prefetchInitialChunks(throwing, "/%")).not.toThrow();
  });
});
