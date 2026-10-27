// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, type RouteRecordRaw } from "vue-router";
import type { QueryClient } from "@tanstack/vue-query";
import type { User } from "@supabase/supabase-js";
import type { CampaignMember } from "@/types/campaign.types";

/**
 * The lens fence, wired (#847).
 *
 * `lens.test.ts` covers the classification and the rule as pure functions.
 * What is left to get wrong is the wiring, and two of the three ways are
 * invisible to those: acting before the mode redirects have settled, and
 * redirecting home while already home — which vue-router counts towards its
 * infinite-redirection limit and aborts the navigation for.
 */
// `child_accounts` is the one table the child-account fence reads (through
// `auth.loadChildLink`, when the store has not loaded the fact yet). It is the
// shared fake, so a lookup that forgets to name the caller finds another
// account's row.
const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: (table: string) => fake.client.from(table),
  },
  getCurrentUser: () => null,
  setCachedUser: () => {},
}));
vi.mock("@/lib/apiKeyVault", () => ({ decryptApiKey: async () => "" }));
vi.mock("@/lib/themeRuntime", () => ({ setTheme: () => {}, setPlayerSeat: () => {} }));
// The real one dynamically imports a shell .vue, which this has no use for.
vi.mock("@/layouts/layoutLoader", () => ({ preloadLayout: async () => undefined }));

import { setupRouterGuard } from "./index";
import { lensRefusal } from "./lens";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
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
    meta: { requiresAuth: true, accountScoped: true, playerReadable: true },
  },
  {
    path: "/billing",
    name: "billing",
    component: Stub,
    meta: { requiresAuth: true, accountScoped: true, playerReadable: true },
  },
  {
    path: "/account/family",
    name: "family",
    component: Stub,
    meta: { requiresAuth: true, accountScoped: true, playerReadable: true },
  },
  {
    path: "/account/family/add",
    name: "family-add",
    component: Stub,
    meta: { requiresAuth: true, accountScoped: true, playerReadable: true },
  },
  { path: "/codex", name: "codex", component: Stub, meta: { requiresAuth: true, playerReadable: true } },
  { path: "/play/inventory", name: "play-inventory", component: Stub, meta: { requiresAuth: true, requiresPlayer: true, layout: "player" } },
  { path: "/admin", name: "admin", component: Stub, meta: { requiresAuth: true, requiresAdmin: true } },
  { path: "/play", name: "play", component: Stub, meta: { requiresAuth: true, requiresPlayer: true, layout: "player" } },
  { path: "/login", name: "login", component: Stub, meta: { layout: "auth", requiresGuest: true } },
  { path: "/welcome", name: "welcome", component: Stub, meta: { layout: "auth", requiresAuth: true } },
  { path: "/reset-password", name: "reset-password", component: Stub, meta: { layout: "auth" } },
  { path: "/w/:slug", name: "open-book", component: Stub, meta: { layout: "public", public: true } },
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
  useAppUiStore().userMode = "dm";
  useCampaignStore().activeCampaignId = campaignId;
}

beforeEach(() => {
  localStorage.clear();
  fake.reset();
  setActivePinia(createPinia());
  lensRefusal.value = null;
});

/** A `child_accounts` row for u1, who turns 16 (leaves the fence) on `adultOn`. */
function seedChild(adultOn: string, childUserId = "u1") {
  fake.seed("child_accounts", [{
    child_user_id: childUserId,
    parent_user_id: "parent1",
    login_name: "kid-hero",
    adult_on: adultOn,
    consent_version: "2026-09-28",
    consented_at: "2020-01-01",
  }]);
}

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
    useAppUiStore().userMode = "player";

    await router.push("/play/home");

    expect(useCampaignStore().activeCampaignId).toBeNull();
    expect(lensRefusal.value).toEqual({ lens: "player", role: "dm" });
  });

  it("leaves the player portal to the player lens", async () => {
    // A DM previewing the portal is a deliberate crossing, and the fence must
    // not read the surface's lens as the one being worn.
    const { router, fetchQuery } = makeRouter([{ campaign_id: "c1", role: "dm" }]);
    await signedInDm("c1");
    useAppUiStore().dmPreviewMode = true;

    await router.push("/play/home");

    expect(fetchQuery).not.toHaveBeenCalled();
    expect(useCampaignStore().activeCampaignId).toBe("c1");
  });
});

/** Signed in, in the player lens — a real player, not a DM previewing. */
async function signedInPlayer() {
  const auth = useAuthStore();
  await auth.initialize();
  auth.user = { id: "u1" } as User;
  useAppUiStore().userMode = "player";
}

describe("account-scoped routes reachable from the player lens (#919)", () => {
  // /account and /billing hold no campaign, but until `playerReadable` was set
  // on them a real player was bounced home by the "away from DM routes" check
  // below: the link PlayerSettingsView renders to "Manage account & billing"
  // led nowhere. #919's Family page hangs off the same page, so this is a
  // precondition for it rather than incidental.
  it.each(["account", "billing"])("lets a real player reach /%s", async (name) => {
    const { router } = makeRouter([]);
    await signedInPlayer();

    await router.push(`/${name}`);

    expect(router.currentRoute.value.name).toBe(name);
  });
});

describe("the child-account fence (#919)", () => {
  it.each(["/billing", "/account/family", "/account/family/add"])(
    "sends a child away from %s to /account, in either lens",
    async (path) => {
      seedChild("2099-01-01");
      const dm = makeRouter([]);
      await signedInDm(null);
      await dm.router.push(path);
      expect(dm.router.currentRoute.value.name).toBe("account");

      setActivePinia(createPinia());
      const player = makeRouter([]);
      await signedInPlayer();
      await player.router.push(path);
      expect(player.router.currentRoute.value.name).toBe("account");
    },
  );

  it("leaves a non-child account on billing", async () => {
    const { router } = makeRouter([]);
    await signedInDm(null);

    await router.push("/billing");

    expect(router.currentRoute.value.name).toBe("billing");
  });

  // The row is RLS-readable by its child; the lookup must name the caller, or
  // a signed-in parent, who can read their children's rows, would be fenced
  // as if they were the child.
  it("does not fence an account because another account's child row exists", async () => {
    seedChild("2099-01-01", "someone-else");
    const { router } = makeRouter([]);
    await signedInDm(null);

    await router.push("/billing");

    expect(router.currentRoute.value.name).toBe("billing");
  });

  // Mirrors private.is_child_account: a link counts until its adult_on, so
  // the day itself is already grown up.
  describe("on the day the child grows up", () => {
    beforeEach(() => vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-27T12:00:00Z") }));
    afterEach(() => vi.useRealTimers());

    it("still fences the day before", async () => {
      seedChild("2026-10-28");
      const { router } = makeRouter([]);
      await signedInDm(null);
      await router.push("/billing");
      expect(router.currentRoute.value.name).toBe("account");
    });

    it("lets them through on adult_on itself", async () => {
      seedChild("2026-10-27");
      const { router } = makeRouter([]);
      await signedInDm(null);
      await router.push("/billing");
      expect(router.currentRoute.value.name).toBe("billing");
    });
  });

  it("does not fence a route the child restriction doesn't cover", async () => {
    seedChild("2099-01-01");
    const { router } = makeRouter([]);
    await signedInDm(null);

    await router.push("/account");

    expect(router.currentRoute.value.name).toBe("account");
  });
});

describe("account pages for an account with no mode yet (#919)", () => {
  // A parent who signs up from a young player's request email has no mode
  // and no campaign. The welcome redirect would swallow the approval form.
  it("lets a brand-new parent reach the approval form", async () => {
    const { router } = makeRouter([]);
    const auth = useAuthStore();
    await auth.initialize();
    auth.user = { id: "u1" } as User;
    vi.spyOn(auth, "inferUserMode").mockResolvedValue(null);

    await router.push("/account/family/add?request=abc");

    expect(router.currentRoute.value.name).toBe("family-add");
  });
});

describe("the child-account fence when the lookup fails (#919)", () => {
  it("keeps billing closed while child status is unknown", async () => {
    fake.failNext("child_accounts", { message: "network down" });
    const { router } = makeRouter([]);
    await signedInDm(null);

    await router.push("/billing");

    expect(router.currentRoute.value.name).toBe("account");
  });
});

describe("who may be where", () => {
  it("sends a signed-out visitor to sign in, remembering where they were going", async () => {
    const { router } = makeRouter([]);

    await router.push("/npcs");

    expect(router.currentRoute.value.name).toBe("login");
    expect(router.currentRoute.value.query.redirect).toBe("/npcs");
  });

  it("lets a signed-out visitor reach the sign-in and reset pages", async () => {
    const { router } = makeRouter([]);
    await router.push("/login");
    expect(router.currentRoute.value.name).toBe("login");
    await router.push("/reset-password");
    expect(router.currentRoute.value.name).toBe("reset-password");
  });

  it("sends a signed-in account away from sign-in, to the home of its lens", async () => {
    const dm = makeRouter([]);
    await signedInDm(null);
    await dm.router.push("/login");
    expect(dm.router.currentRoute.value.name).toBe("dashboard");

    setActivePinia(createPinia());
    const player = makeRouter([]);
    await signedInPlayer();
    await player.router.push("/login");
    expect(player.router.currentRoute.value.name).toBe("play-home");
  });

  it("keeps an admin page to the admin, sending everyone else home", async () => {
    const dm = makeRouter([]);
    await signedInDm(null);
    await dm.router.push("/admin");
    expect(dm.router.currentRoute.value.name).toBe("dashboard");

    setActivePinia(createPinia());
    const player = makeRouter([]);
    await signedInPlayer();
    await player.router.push("/admin");
    expect(player.router.currentRoute.value.name).toBe("play-home");

    setActivePinia(createPinia());
    const admin = makeRouter([]);
    await signedInDm(null);
    useAuthStore().user = Object.assign({ id: "u1" } as User, { app_metadata: { role: "admin" } });
    await admin.router.push("/admin");
    expect(admin.router.currentRoute.value.name).toBe("admin");
  });

  it("lets a player into the DM pages marked readable by players, and no others", async () => {
    const { router } = makeRouter([]);
    await signedInPlayer();

    await router.push("/codex");
    expect(router.currentRoute.value.name).toBe("codex");

    await router.push("/npcs");
    expect(router.currentRoute.value.name).toBe("play-home");
  });

  // An account that predates the lens (or a fresh device) takes it from its
  // memberships instead of being asked again.
  it("infers the lens of a modeless account from its memberships, and does not ask it to choose", async () => {
    const { router } = makeRouter([]);
    const auth = useAuthStore();
    await auth.initialize();
    auth.user = { id: "u1" } as User;
    vi.spyOn(auth, "inferUserMode").mockResolvedValue("dm");

    await router.push("/npcs");

    expect(router.currentRoute.value.name).toBe("npcs");
    expect(useAppUiStore().userMode).toBe("dm");
  });

  it("lets a signed-in account with no mode and no memberships choose one", async () => {
    const { router } = makeRouter([]);
    const auth = useAuthStore();
    await auth.initialize();
    auth.user = { id: "u1" } as User;
    vi.spyOn(auth, "inferUserMode").mockResolvedValue(null);

    await router.push("/welcome");

    expect(router.currentRoute.value.name).toBe("welcome");
  });

  it("keeps a player off the DM's pages", async () => {
    const { router } = makeRouter([]);
    await signedInPlayer();

    await router.push("/npcs");

    expect(router.currentRoute.value.name).toBe("play-home");
  });

  describe("the player portal", () => {
    it("is closed to a DM, unless previewing it or managing a character from the party page", async () => {
      const closed = makeRouter([]);
      await signedInDm(null);
      await closed.router.push("/play/home");
      expect(closed.router.currentRoute.value.name).toBe("dashboard");

      useAppUiStore().dmPreviewMode = true;
      await closed.router.push("/play/home");
      expect(closed.router.currentRoute.value.name).toBe("play-home");

      useAppUiStore().dmPreviewMode = false;
      useAuthStore().membership = { role: "dm" } as CampaignMember;
      await closed.router.push("/dashboard");
      await closed.router.push("/play/home?memberId=pm1");
      expect(closed.router.currentRoute.value.name).toBe("play-home");
    });

    // memberId is how a DM opens one of their players' characters; it is not a
    // key for anyone else, nor for the pack page, which reads no memberId.
    it("does not open to a memberId from anyone who is not the campaign's DM, nor to the pack page", async () => {
      const stranger = makeRouter([]);
      await signedInDm(null);
      await stranger.router.push("/play?memberId=pm1");
      expect(stranger.router.currentRoute.value.name).toBe("dashboard");

      useAuthStore().membership = { role: "dm" } as CampaignMember;
      await stranger.router.push("/play/inventory?memberId=pm1");
      expect(stranger.router.currentRoute.value.name).toBe("dashboard");
    });

    it("sends a member-of-nothing player to the character pool rather than a campaign page", async () => {
      const { router } = makeRouter([]);
      await signedInPlayer();

      await router.push("/play");

      expect(router.currentRoute.value.name).toBe("play-home");
    });

    it("lets a seated player into a campaign page", async () => {
      const { router } = makeRouter([]);
      await signedInPlayer();
      useAuthStore().membership = { role: "player" } as CampaignMember;

      await router.push("/play");

      expect(router.currentRoute.value.name).toBe("play");
    });
  });

  it("sends an account that has chosen a mode away from the welcome choice", async () => {
    const { router } = makeRouter([]);
    await signedInDm(null);

    await router.push("/welcome");

    expect(router.currentRoute.value.name).toBe("dashboard");
  });
});

describe("the password reset link", () => {
  // The emailed link signs the account in with a recovery session before the
  // guard runs. A brand-new account has no mode yet, and the welcome redirect
  // would swallow the form it came for — the case that prompted the feature.
  it("reaches the form from an account with no mode yet", async () => {
    const { router } = makeRouter([]);
    const auth = useAuthStore();
    await auth.initialize();
    auth.user = { id: "u1" } as User;
    vi.spyOn(auth, "inferUserMode").mockResolvedValue(null);

    await router.push("/reset-password");

    expect(router.currentRoute.value.name).toBe("reset-password");
  });

  it("reaches the form from the player lens", async () => {
    const { router } = makeRouter([]);
    const auth = useAuthStore();
    await auth.initialize();
    auth.user = { id: "u1" } as User;
    useAppUiStore().userMode = "player";

    await router.push("/reset-password");

    expect(router.currentRoute.value.name).toBe("reset-password");
  });

  it("still sends a modeless account elsewhere to the welcome choice", async () => {
    const { router } = makeRouter([]);
    const auth = useAuthStore();
    await auth.initialize();
    auth.user = { id: "u1" } as User;
    vi.spyOn(auth, "inferUserMode").mockResolvedValue(null);

    await router.push("/npcs");

    expect(router.currentRoute.value.name).toBe("welcome");
  });
});

describe("a public page (the Open Book, #1085)", () => {
  it("is never redirected for a visitor who is signed out", async () => {
    const { router } = makeRouter([]);
    await router.push("/w/salt");
    expect(router.currentRoute.value.name).toBe("open-book");
  });

  it("is never redirected for a signed-in account with no mode, a DM or a player", async () => {
    for (const mode of ["", "dm", "player"] as const) {
      const { router } = makeRouter([{ campaign_id: "c1", role: mode === "player" ? "player" : "dm" }]);
      await signedInDm("c1");
      useAppUiStore().userMode = mode;
      await router.push("/w/salt");
      expect(router.currentRoute.value.name).toBe("open-book");
    }
  });
});
