import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * The child-account link (#919): loading it, resetting it, and the
 * `isChildAccount` computed built on top of it. This is the identity fact
 * `useCampaignStore().isAiEnabled` reads directly (a Pinia computed cannot
 * open the `useQuery`-backed `useChildAccount()` composable), so a wrong
 * answer here re-enables AI UI for a child DM.
 */
const { childAccountsTable } = vi.hoisted(() => ({
  childAccountsTable: {
    resolve: async () => ({ data: null as unknown, error: null as unknown }),
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            table === "child_accounts"
              ? childAccountsTable.resolve()
              : Promise.resolve({ data: null, error: null }),
        }),
      }),
    }),
  },
  setCachedUser: () => {},
}));

import { useAuthStore } from "./auth";

const ACTIVE_LINK = {
  child_user_id: "u1",
  parent_user_id: "parent1",
  login_name: "kid-hero",
  adult_on: "2099-01-01",
  consent_version: "2026-09-28",
  consented_at: "2020-01-01",
};

const EXPIRED_LINK = { ...ACTIVE_LINK, adult_on: "2000-01-01" };

beforeEach(() => {
  setActivePinia(createPinia());
  childAccountsTable.resolve = async () => ({ data: null, error: null });
});

describe("loadChildLink / isChildAccount (#919)", () => {
  it("starts with no link loaded", () => {
    const auth = useAuthStore();
    expect(auth.childLink).toBeNull();
    expect(auth.childLinkLoaded).toBe(false);
    expect(auth.isChildAccount).toBe(false);
  });

  it("loads an active link and reports isChildAccount", async () => {
    childAccountsTable.resolve = async () => ({ data: ACTIVE_LINK, error: null });
    const auth = useAuthStore();

    await auth.loadChildLink("u1");

    expect(auth.childLink).toEqual(ACTIVE_LINK);
    expect(auth.childLinkLoaded).toBe(true);
    expect(auth.isChildAccount).toBe(true);
  });

  it("loads a link past its adult_on as loaded but not a child", async () => {
    childAccountsTable.resolve = async () => ({ data: EXPIRED_LINK, error: null });
    const auth = useAuthStore();

    await auth.loadChildLink("u1");

    expect(auth.childLinkLoaded).toBe(true);
    expect(auth.isChildAccount).toBe(false);
  });

  it("loads no row (not a child) as loaded and confirmed false", async () => {
    childAccountsTable.resolve = async () => ({ data: null, error: null });
    const auth = useAuthStore();

    await auth.loadChildLink("u1");

    expect(auth.childLink).toBeNull();
    expect(auth.childLinkLoaded).toBe(true);
    expect(auth.isChildAccount).toBe(false);
  });

  // The safety property the executor spec calls for: a first failed load must
  // never read as "confirmed not a child", because that is exactly the state
  // that would show AI/billing UI to a child on a dropped request.
  it("leaves childLinkLoaded false on a failed first load", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    childAccountsTable.resolve = async () => ({ data: null, error: new Error("offline") });
    const auth = useAuthStore();

    await auth.loadChildLink("u1");

    expect(auth.childLinkLoaded).toBe(false);
    expect(auth.childLink).toBeNull();
    expect(auth.isChildAccount).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  // A refetch (TermsGate polls every 20s while waiting for a parent) must not
  // erase an already-known-good link just because one request drops.
  it("keeps an already-loaded link across a failed refetch", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    childAccountsTable.resolve = async () => ({ data: ACTIVE_LINK, error: null });
    const auth = useAuthStore();
    await auth.loadChildLink("u1");

    childAccountsTable.resolve = async () => ({ data: null, error: new Error("offline") });
    await auth.loadChildLink("u1");

    expect(auth.childLinkLoaded).toBe(true);
    expect(auth.childLink).toEqual(ACTIVE_LINK);
    expect(auth.isChildAccount).toBe(true);
    errorSpy.mockRestore();
  });

  it("resets the link on sign-out", async () => {
    childAccountsTable.resolve = async () => ({ data: ACTIVE_LINK, error: null });
    const auth = useAuthStore();
    await auth.loadChildLink("u1");
    expect(auth.isChildAccount).toBe(true);

    await auth.signOut();

    expect(auth.childLink).toBeNull();
    expect(auth.childLinkLoaded).toBe(false);
    expect(auth.isChildAccount).toBe(false);
  });
});
