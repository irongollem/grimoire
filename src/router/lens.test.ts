import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { QueryClient } from "@tanstack/vue-query";
import type { RouteRecordRaw } from "vue-router";

// The stores and the memberships query reach for the client, the vault and the
// theme on import; none is under test here, and `@/lib/supabase` throws at
// module load without env vars.
vi.mock("@/lib/supabase", () => ({
  supabase: {},
  getCurrentUser: () => null,
  setCachedUser: () => {},
}));
vi.mock("@/lib/apiKeyVault", () => ({ decryptApiKey: async () => "" }));
vi.mock("@/composables/useTheme", () => ({ useTheme: () => ({ setTheme: () => {} }) }));

import { routes } from "./routes";
import {
  knownRoleInCampaign,
  lensContradicts,
  resolveRoleInCampaign,
  routeLens,
} from "./lens";
import { useAuthStore } from "@/stores/auth";
import type { CampaignMember } from "@/types/campaign.types";

// ── The route table, flattened ────────────────────────────────────────────────

type FlatRoute = { name: string; path: string; meta: Record<string, unknown> };

/** Full paths and parent-merged meta, which is what `to` carries in the guard.
 *  Done here rather than through `router.getRoutes()` because the merge is the
 *  property under test: a nested detail route inherits nothing from its list at
 *  the record level, and reading the un-merged record would test the wrong
 *  thing. */
function flatten(records: readonly RouteRecordRaw[], parent = "", inherited = {}): FlatRoute[] {
  return records.flatMap((record) => {
    const path = record.path.startsWith("/")
      ? record.path
      : `${parent.replace(/\/$/, "")}/${record.path}`;
    const meta = { ...inherited, ...record.meta };
    const self: FlatRoute[] = record.name
      ? [{ name: String(record.name), path, meta }]
      : [];
    return [...self, ...flatten(record.children ?? [], path, meta)];
  });
}

const ALL_ROUTES = flatten(routes);

/**
 * The routes the fence deliberately does not cover, by name — the whole set,
 * not a sample.
 *
 * This is the "DM routes carry it" assertion, and it is written as the
 * complement on purpose. Asserting that today's DM routes are fenced passes
 * forever while saying nothing about the route added next week; asserting that
 * *these eleven and no others* are unfenced fails the moment a campaign
 * surface slips out of the fence, and makes adding one a decision someone has
 * to write down here.
 *
 * Each is a route with no campaign to contradict: the auth shell, the
 * unauthenticated harnesses and the 404, and `/admin`, which is account-scoped
 * and carries `requiresAdmin` instead. The three dev routes are present because
 * `import.meta.env.DEV` is true under vitest, which is the same condition that
 * registers them.
 */
const UNFENCED = [
  "login",
  "signup",
  "join-campaign",
  "welcome",
  "oauth-consent",
  "spotify-callback",
  "admin",
  "spike-pagedjs",
  "sheet-calibration",
  "component-catalogue",
  "not-found",
];

describe("routeLens — which lens a route's campaign belongs to", () => {
  it("fences every authenticated campaign surface", () => {
    const unfenced = ALL_ROUTES.filter((r) => routeLens(r) === null).map((r) => r.name);

    expect(unfenced.sort()).toEqual([...UNFENCED].sort());
  });

  it("puts the whole /play area in the player lens", () => {
    const playRoutes = ALL_ROUTES.filter((r) => r.path === "/play" || r.path.startsWith("/play/"));

    expect(playRoutes.length).toBeGreaterThan(0);
    for (const route of playRoutes) expect(routeLens(route)).toBe("player");
  });

  // The guard fences by path and the routes declare `requiresPlayer`; two
  // spellings of one boundary, and a player route added outside `/play` would
  // be fenced as a DM surface with nothing to say so.
  it("keeps the path fence and requiresPlayer in agreement", () => {
    const byMeta = ALL_ROUTES.filter((r) => r.meta.requiresPlayer).map((r) => r.name);
    const byLens = ALL_ROUTES.filter((r) => routeLens(r) === "player").map((r) => r.name);

    expect(byLens.sort()).toEqual(byMeta.sort());
  });

  it.each([
    "dashboard",
    "npcs",
    "npc-detail",
    "quests",
    "monsters",
    "soundboard",
    "account",
    "billing",
    "campaign-settings",
  ])("puts %s in the DM lens", (name) => {
    const route = ALL_ROUTES.find((r) => r.name === name);

    expect(route).toBeDefined();
    expect(routeLens(route!)).toBe("dm");
  });

  it("reaches a nested detail route through its parent's meta", () => {
    // `npc-detail` declares no `layout`, and inherits `requiresAuth` from
    // nothing — it carries its own. What it must not do is fall out of the
    // fence because the flattening lost the parent.
    const detail = ALL_ROUTES.find((r) => r.name === "npc-detail")!;

    expect(detail.path).toBe("/npcs/:id");
    expect(routeLens(detail)).toBe("dm");
  });
});

// ── The rule ──────────────────────────────────────────────────────────────────

describe("lensContradicts — a lens may only hold a campaign it has the role for", () => {
  it("does not contradict when the role matches the lens", () => {
    expect(lensContradicts("dm", "dm")).toBe(false);
    expect(lensContradicts("player", "player")).toBe(false);
  });

  it("contradicts when the account holds the other role", () => {
    expect(lensContradicts("dm", "player")).toBe(true);
    expect(lensContradicts("player", "dm")).toBe(true);
  });

  it("contradicts when there is no membership at all", () => {
    expect(lensContradicts("dm", null)).toBe(true);
  });

  // The whole reason the resolved role is tri-state. A failed lookup on the
  // navigation path would otherwise throw a DM out of their live campaign for
  // one dropped request, mid-session — see the type's docstring.
  it("never contradicts on an unresolved role", () => {
    expect(lensContradicts("dm", undefined)).toBe(false);
    expect(lensContradicts("player", undefined)).toBe(false);
  });
});

// ── Resolution ────────────────────────────────────────────────────────────────

function membership(campaignId: string, role: "dm" | "player"): CampaignMember {
  return { id: "m1", campaign_id: campaignId, user_id: "u1", role } as CampaignMember;
}

describe("resolving the role in a campaign", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("answers from the membership already loaded for that campaign", () => {
    useAuthStore().membership = membership("c1", "dm");

    expect(knownRoleInCampaign("c1")).toBe("dm");
  });

  it("answers 'don't know' when the loaded membership is for another campaign", () => {
    // The window after a campaign switch, while refreshMembership is in flight.
    useAuthStore().membership = membership("c2", "dm");

    expect(knownRoleInCampaign("c1")).toBeUndefined();
    expect(knownRoleInCampaign("c2")).toBe("dm");
  });

  it("answers 'don't know' when no membership is loaded", () => {
    expect(knownRoleInCampaign("c1")).toBeUndefined();
  });

  it("costs no request when the loaded membership already answers", async () => {
    useAuthStore().membership = membership("c1", "dm");
    const fetchQuery = vi.fn();

    await expect(resolveRoleInCampaign({ fetchQuery } as unknown as QueryClient, "c1"))
      .resolves.toBe("dm");
    expect(fetchQuery).not.toHaveBeenCalled();
  });

  it("asks when the loaded membership is for another campaign", async () => {
    useAuthStore().membership = membership("c2", "dm");
    const fetchQuery = vi.fn().mockResolvedValue([{ campaign_id: "c1", role: "player" }]);

    await expect(resolveRoleInCampaign({ fetchQuery } as unknown as QueryClient, "c1"))
      .resolves.toBe("player");
  });

  it("answers null for a campaign this account is not a member of", async () => {
    const fetchQuery = vi.fn().mockResolvedValue([{ campaign_id: "c2", role: "dm" }]);

    await expect(resolveRoleInCampaign({ fetchQuery } as unknown as QueryClient, "c1"))
      .resolves.toBeNull();
  });

  it("answers 'don't know' when the lookup fails", async () => {
    const fetchQuery = vi.fn().mockRejectedValue(new Error("offline"));

    await expect(resolveRoleInCampaign({ fetchQuery } as unknown as QueryClient, "c1"))
      .resolves.toBeUndefined();
  });

  // The confirmation before closing someone's campaign. A cached role is fine
  // for "carry on" and is not evidence enough to act on: once co-DM ships
  // (#590) the account whose cached role still says `player` is precisely the
  // one just promoted.
  it("skips both caches when asked for a fresh answer", async () => {
    useAuthStore().membership = membership("c1", "player");
    const fetchQuery = vi.fn().mockResolvedValue([{ campaign_id: "c1", role: "dm" }]);

    await expect(
      resolveRoleInCampaign({ fetchQuery } as unknown as QueryClient, "c1", { fresh: true }),
    ).resolves.toBe("dm");
    expect(fetchQuery).toHaveBeenCalledWith(expect.objectContaining({ staleTime: 0 }));
  });

  it("leaves the query cache to decide on the ordinary path", async () => {
    const fetchQuery = vi.fn().mockResolvedValue([]);

    await resolveRoleInCampaign({ fetchQuery } as unknown as QueryClient, "c1");

    expect(fetchQuery).toHaveBeenCalledWith(
      expect.not.objectContaining({ staleTime: expect.anything() }),
    );
  });
});
