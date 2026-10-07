import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import type { Router } from "vue-router";

const prefetchRouteChunks = vi.fn();
vi.mock("./prefetchInitial", () => ({ prefetchRouteChunks: (...args: unknown[]) => prefetchRouteChunks(...args) }));
const auth = reactive({ currentRole: null as string | null });
vi.mock("@/stores/auth", () => ({ useAuthStore: () => auth }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => null }));
// Run every idle slot at once so the chain can be asserted synchronously.
vi.mock("@/lib/afterFirstPaint", () => ({ afterFirstPaint: (task: () => void) => { task(); return () => undefined; } }));

import { idlePrefetchAllowed, prefetchChunksWhenIdle, startIdleChunkPrefetch } from "./idlePrefetch";

beforeEach(() => {
  auth.currentRole = null;
  prefetchRouteChunks.mockClear();
});

describe("idlePrefetchAllowed", () => {
  it("allows unknown connections and refuses data saver and 2g", () => {
    expect(idlePrefetchAllowed(undefined)).toBe(true);
    expect(idlePrefetchAllowed({ effectiveType: "4g" })).toBe(true);
    expect(idlePrefetchAllowed({ saveData: true, effectiveType: "4g" })).toBe(false);
    expect(idlePrefetchAllowed({ effectiveType: "2g" })).toBe(false);
    expect(idlePrefetchAllowed({ effectiveType: "slow-2g" })).toBe(false);
  });
});

describe("prefetchChunksWhenIdle", () => {
  it("requests every path in order", () => {
    prefetchChunksWhenIdle({} as Router, ["/a", "/b", "/c"]);
    expect(prefetchRouteChunks.mock.calls.map((call) => call[1])).toEqual(["/a", "/b", "/c"]);
  });
});

describe("startIdleChunkPrefetch", () => {
  it("waits for a role, then prefetches the DM destinations once", () => {
    startIdleChunkPrefetch({} as Router);
    expect(prefetchRouteChunks).not.toHaveBeenCalled();
    auth.currentRole = "dm";
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      const paths = prefetchRouteChunks.mock.calls.map((call) => call[1]);
      expect(paths).toContain("/dashboard");
      expect(paths).not.toContain("/play");
      expect(paths).not.toContain("/character-sheet");
    });
  });

  it("prefetches the player portal for a player", () => {
    auth.currentRole = "player";
    startIdleChunkPrefetch({} as Router);
    const paths = prefetchRouteChunks.mock.calls.map((call) => call[1]);
    expect(paths).toContain("/play/journal");
    expect(paths).not.toContain("/npcs");
  });
});
