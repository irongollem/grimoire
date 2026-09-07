import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type RouteRecordRaw } from "vue-router";
import type { QueryClient } from "@tanstack/vue-query";
import type { User } from "@supabase/supabase-js";

/**
 * The lens fence, wired (#847).
 *
 * `lens.test.ts` covers the classification and the rule as pure functions.
 * What is left to get wrong is the wiring, and two of the three ways are
 * invisible to those: acting before the mode redirects have settled, and
 * redirecting home while already home — which vue-router counts towards its
 * infinite-redirection limit and aborts the navigation for.
 */
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
  getCurrentUser: () => null,
  setCachedUser: () => {},
}));
vi.mock("@/lib/apiKeyVault", () => ({ decryptApiKey: async () => "" }));
vi.mock("@/composables/useTheme", () => ({ useTheme: () => ({ setTheme: () => {} }) }));
// The real one dynamically imports a shell .vue, which this has no use for.
vi.mock("@/layouts/layoutLoader", () => ({ preloadLayout: async () => undefined }));

import { setupRouterGuard } from "./index";
import { lensRefusal } from "./lens";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";

const Stub = { template: "<div />" };

/** A shape-accurate slice of the real table — the meta the guard reads, not the
 *  110 routes carrying it. `lens.test.ts` is what holds those. */
const TEST_ROUTES: RouteRecordRaw[] = [
  { path: "/dashboard", name: "dashboard", component: Stub, meta: { requiresAuth: true } },
  { path: "/npcs", name: "npcs", component: Stub, meta: { requiresAuth: true } },
  {
    path: "/play/home",
    name: "play-home",
    component: Stub,
    meta: { requiresAuth: true, requiresPlayer: true, playerStandalone: true, layout: "player" },
  },
  {
    path: "/account",
    name: "account",
    component: Stub,
    meta: { requiresAuth: true },
  },
  { path: "/login", name: "login", component: Stub, meta: { layout: "auth", requiresGuest: true } },
];

function makeRouter(memberships: { campaign_id: string; role: "dm" | "player" }[] | Error) {
  const fetchQuery = vi.fn(() =>
    memberships instanceof Error ? Promise.reject(memberships) : Promise.resolve(memberships),
  );
  const router = createRouter({ history: createMemoryHistory(), routes: TEST_ROUTES });
  setupRouterGuard(router, { fetchQuery } as unknown as QueryClient);
  return { router, fetchQuery };
}

/** Signed in, in the DM lens, with `campaignId` active — and no membership row
 *  loaded, so the fence has to go and resolve one. */
async function signedInDm(campaignId: string | null) {
  const auth = useAuthStore();
  // Settles `initialized` against the null session above, then puts a user in
  // place; every later `initialize()` returns immediately.
  await auth.initialize();
  auth.user = { id: "u1" } as User;
  useUiStore().userMode = "dm";
  useCampaignStore().activeCampaignId = campaignId;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  lensRefusal.value = null;
});

describe("the lens fence", () => {
  it("lets a DM through to a campaign they run", async () => {
    const { router } = makeRouter([{ campaign_id: "c1", role: "dm" }]);
    await signedInDm("c1");

    await router.push("/npcs");

    expect(router.currentRoute.value.name).toBe("npcs");
    expect(useCampaignStore().activeCampaignId).toBe("c1");
    expect(lensRefusal.value).toBeNull();
  });

  it("closes a campaign the DM lens only plays in, and says so", async () => {
    const { router } = makeRouter([{ campaign_id: "c1", role: "player" }]);
    await signedInDm("c1");

    await router.push("/npcs");

    expect(useCampaignStore().activeCampaignId).toBeNull();
    expect(router.currentRoute.value.name).toBe("dashboard");
    expect(lensRefusal.value).toEqual({ lens: "dm", role: "player" });
  });

  it("closes a campaign this account is not a member of at all", async () => {
    const { router } = makeRouter([{ campaign_id: "c2", role: "dm" }]);
    await signedInDm("c1");

    await router.push("/npcs");

    expect(useCampaignStore().activeCampaignId).toBeNull();
    expect(lensRefusal.value).toEqual({ lens: "dm", role: null });
  });

  // The self-redirect: home is a DM route too, so a naive `return home()` from
  // the dashboard bounces the dashboard at itself.
  it("closes the campaign without redirecting when already home", async () => {
    const { router } = makeRouter([{ campaign_id: "c1", role: "player" }]);
    await signedInDm("c1");

    await router.push("/dashboard");

    expect(router.currentRoute.value.name).toBe("dashboard");
    expect(useCampaignStore().activeCampaignId).toBeNull();
  });

  // A failed lookup is the absence of evidence, and on the navigation path
  // acting on it would cost a DM their live campaign for one dropped request.
  // Deliberately the opposite of `switchUserMode`, whose unknown costs a click.
  it("leaves the campaign alone when the role cannot be resolved", async () => {
    const { router } = makeRouter(new Error("offline"));
    await signedInDm("c1");

    await router.push("/npcs");

    expect(router.currentRoute.value.name).toBe("npcs");
    expect(useCampaignStore().activeCampaignId).toBe("c1");
    expect(lensRefusal.value).toBeNull();
  });

  it("confirms against the server before closing anything", async () => {
    // Cached says player, the server says dm: the shape of a co-DM promoted a
    // minute ago (#590), and the one case where acting on the cache would make
    // this fence cause the bug it exists to prevent.
    const { router, fetchQuery } = makeRouter([{ campaign_id: "c1", role: "player" }]);
    fetchQuery.mockResolvedValueOnce([{ campaign_id: "c1", role: "player" }]);
    fetchQuery.mockResolvedValueOnce([{ campaign_id: "c1", role: "dm" }]);
    await signedInDm("c1");

    await router.push("/npcs");

    expect(fetchQuery).toHaveBeenCalledTimes(2);
    expect(useCampaignStore().activeCampaignId).toBe("c1");
    expect(router.currentRoute.value.name).toBe("npcs");
  });

  it("asks nothing when no campaign is active", async () => {
    const { router, fetchQuery } = makeRouter([]);
    await signedInDm(null);

    await router.push("/npcs");

    expect(fetchQuery).not.toHaveBeenCalled();
    expect(router.currentRoute.value.name).toBe("npcs");
  });

  // The fence is over the campaign, not the page. `/account` holds no campaign
  // of its own, but the campaign in the slot behind it is still the wrong one.
  it("closes the campaign from a DM page that is not campaign-scoped", async () => {
    const { router } = makeRouter([{ campaign_id: "c1", role: "player" }]);
    await signedInDm("c1");

    await router.push("/account");

    expect(useCampaignStore().activeCampaignId).toBeNull();
    expect(router.currentRoute.value.name).toBe("dashboard");
  });

  // The symmetric half. The rule is written over the lens rather than for the
  // DM alone, because the DM-only spelling is a hole the co-DM work (#590)
  // would walk straight into.
  it("closes a campaign the player lens actually runs", async () => {
    const { router } = makeRouter([{ campaign_id: "c1", role: "dm" }]);
    await signedInDm("c1");
    useUiStore().userMode = "player";

    await router.push("/play/home");

    expect(useCampaignStore().activeCampaignId).toBeNull();
    expect(lensRefusal.value).toEqual({ lens: "player", role: "dm" });
  });

  it("leaves the player portal to the player lens", async () => {
    // A DM previewing the portal is a deliberate crossing, and the fence must
    // not read the surface's lens as the one being worn.
    const { router, fetchQuery } = makeRouter([{ campaign_id: "c1", role: "dm" }]);
    await signedInDm("c1");
    useUiStore().dmPreviewMode = true;

    await router.push("/play/home");

    expect(fetchQuery).not.toHaveBeenCalled();
    expect(useCampaignStore().activeCampaignId).toBe("c1");
  });
});
