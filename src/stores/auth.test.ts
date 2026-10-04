import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * The child-account link (#919): loading it, resetting it, and the
 * `isChildAccount` computed built on top of it. This is the identity fact
 * `useCampaignStore().isAiEnabled` reads directly (a Pinia computed cannot
 * open the `useQuery`-backed `useChildAccount()` composable), so a wrong
 * answer here re-enables AI UI for a child DM.
 */
type Result = { data: unknown; error: unknown };
const { childAccountsTable, tables, authState } = vi.hoisted(() => ({
  childAccountsTable: {
    resolve: async () => ({ data: null as unknown, error: null as unknown }),
  },
  tables: {
    campaign_members: (async () => ({ data: null, error: null })) as () => Promise<Result>,
    profiles: (async () => ({ data: null, error: null })) as () => Promise<Result>,
  },
  authState: {
    session: null as unknown,
    listener: null as null | ((event: string, session: unknown) => void),
  },
}));

// Every query-builder method returns the builder; the terminal calls resolve
// per table, so the membership query's two shapes (with and without a campaign
// id) both work.
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: authState.session } }),
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        authState.listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => ({ error: null }),
    },
    from: (table: string) => {
      const run = () =>
        table === "child_accounts"
          ? childAccountsTable.resolve()
          : table === "campaign_members"
            ? tables.campaign_members()
            : tables.profiles();
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: run,
        single: run,
      };
      return builder;
    },
  },
  setCachedUser: () => {},
}));

import { useAuthStore } from "./auth";
import { readAuthSnapshot, writeAuthSnapshot } from "@/lib/authSnapshot";
import type { CampaignMember } from "@/types/campaign.types";
import type { ChildAccountLink } from "@/types/childAccount.types";
import { nextTick } from "vue";

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
  localStorage.clear();
  authState.session = null;
  authState.listener = null;
  childAccountsTable.resolve = async () => ({ data: null, error: null });
  tables.campaign_members = async () => ({ data: null, error: null });
  tables.profiles = async () => ({ data: null, error: null });
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

const MEMBER = {
  id: "m1",
  user_id: "u1",
  campaign_id: "c1",
  role: "dm",
  display_name: "Gandalf",
} as unknown as CampaignMember;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function signedIn() {
  authState.session = { user: { id: "u1", app_metadata: {} } };
  localStorage.setItem("grimoire_active_campaign", "c1");
}

describe("initialize() and the identity snapshot", () => {
  it("mounts from the snapshot before the network trio answers, then revalidates", async () => {
    signedIn();
    writeAuthSnapshot({
      v: 1,
      userId: "u1",
      membership: MEMBER,
      username: "old-name",
      childLink: ACTIVE_LINK as unknown as ChildAccountLink,
      childLinkLoaded: true,
    });
    const gate = deferred<Result>();
    tables.campaign_members = () => gate.promise;
    tables.profiles = () => gate.promise.then(() => ({ data: { username: "new-name" }, error: null }));
    childAccountsTable.resolve = () => gate.promise.then(() => ({ data: null, error: null }));

    const auth = useAuthStore();
    await auth.initialize();

    expect(auth.initialized).toBe(true);
    expect(auth.membership).toEqual(MEMBER);
    expect(auth.username).toBe("old-name");
    expect(auth.childLinkLoaded).toBe(true);
    expect(auth.isChildAccount).toBe(true);

    gate.resolve({ data: { ...MEMBER, role: "player" }, error: null });
    await vi.waitFor(() => expect(auth.username).toBe("new-name"));
    await vi.waitFor(() => expect(auth.childLink).toBeNull());
    expect(auth.membership?.role).toBe("player");
  });

  it("awaits the trio when there is no snapshot", async () => {
    signedIn();
    const gate = deferred<Result>();
    tables.campaign_members = () => gate.promise;
    const auth = useAuthStore();

    let done = false;
    void auth.initialize().then(() => (done = true));
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);
    expect(auth.initialized).toBe(false);

    gate.resolve({ data: MEMBER, error: null });
    await vi.waitFor(() => expect(done).toBe(true));
    expect(auth.membership).toEqual(MEMBER);
    await nextTick();
    expect(readAuthSnapshot("u1", "c1")?.membership).toEqual(MEMBER);
  });

  it("keeps existing membership and username when their reads fail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn();
    writeAuthSnapshot({
      v: 1,
      userId: "u1",
      membership: MEMBER,
      username: "kept",
      childLink: null,
      childLinkLoaded: true,
    });
    tables.campaign_members = async () => ({ data: null, error: new Error("offline") });
    tables.profiles = async () => ({ data: null, error: new Error("offline") });
    const auth = useAuthStore();
    await auth.initialize();
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));

    expect(auth.membership).toEqual(MEMBER);
    expect(auth.username).toBe("kept");
    expect(readAuthSnapshot("u1", "c1")?.username).toBe("kept");
    errorSpy.mockRestore();
  });
});

describe("auth listener reloads", () => {
  async function bootAndCount() {
    signedIn();
    const reads = { n: 0 };
    tables.campaign_members = async () => {
      reads.n++;
      return { data: MEMBER, error: null };
    };
    const auth = useAuthStore();
    await auth.initialize();
    reads.n = 0;
    return { auth, reads };
  }

  it("does not reload on INITIAL_SESSION", async () => {
    const { reads } = await bootAndCount();
    authState.listener?.("INITIAL_SESSION", authState.session);
    await new Promise((r) => setTimeout(r, 10));
    expect(reads.n).toBe(0);
  });

  it("does not reload on a same-user SIGNED_IN or TOKEN_REFRESHED right after boot", async () => {
    const { reads } = await bootAndCount();
    authState.listener?.("SIGNED_IN", authState.session);
    authState.listener?.("TOKEN_REFRESHED", authState.session);
    await new Promise((r) => setTimeout(r, 10));
    expect(reads.n).toBe(0);
  });

  it("reloads on SIGNED_IN once the last load is no longer fresh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { reads } = await bootAndCount();
      vi.setSystemTime(Date.now() + 60_000);
      authState.listener?.("SIGNED_IN", authState.session);
      await vi.waitFor(() => expect(reads.n).toBe(1));
    } finally {
      vi.useRealTimers();
    }
  });

  it("reloads on SIGNED_IN for a different user", async () => {
    const { reads } = await bootAndCount();
    authState.listener?.("SIGNED_IN", { user: { id: "u2" } });
    await vi.waitFor(() => expect(reads.n).toBe(1));
  });

  it("retries on a same-user event when the first child-link load failed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    signedIn();
    const reads = { n: 0 };
    childAccountsTable.resolve = async () => {
      reads.n++;
      return reads.n === 1 ? { data: null, error: new Error("offline") } : { data: null, error: null };
    };
    const auth = useAuthStore();
    await auth.initialize();
    expect(auth.childLinkLoaded).toBe(false);

    authState.listener?.("TOKEN_REFRESHED", authState.session);
    await vi.waitFor(() => expect(auth.childLinkLoaded).toBe(true));
    expect(reads.n).toBe(2);
    errorSpy.mockRestore();
  });
});

describe("snapshot lifecycle", () => {
  it("sign-out leaves no snapshot behind", async () => {
    signedIn();
    tables.campaign_members = async () => ({ data: MEMBER, error: null });
    const auth = useAuthStore();
    await auth.initialize();
    await nextTick();
    expect(readAuthSnapshot("u1", "c1")).not.toBeNull();

    await auth.signOut();
    await nextTick();

    expect(readAuthSnapshot("u1", undefined)).toBeNull();
    expect(localStorage.getItem("grimoire:auth-snapshot")).toBeNull();
  });

  it("a boot with no session removes the previous account's snapshot", async () => {
    writeAuthSnapshot({
      v: 1,
      userId: "u1",
      membership: null,
      username: "previous",
      childLink: null,
      childLinkLoaded: true,
    });
    authState.session = null;

    await useAuthStore().initialize();

    expect(localStorage.getItem("grimoire:auth-snapshot")).toBeNull();
  });
});

describe("a different account arriving without a sign-out", () => {
  // An adult with no campaign: the case where nothing but the reset stands
  // between this account's facts and the next account's snapshot.
  async function bootAsAdultWithNoCampaign() {
    authState.session = { user: { id: "u1", app_metadata: {} } };
    tables.profiles = async () => ({ data: { username: "the-parent" }, error: null });
    const auth = useAuthStore();
    await auth.initialize();
    await nextTick();
    expect(auth.username).toBe("the-parent");
    expect(auth.childLinkLoaded).toBe(true);
    return auth;
  }

  it("clears the previous account's identity before the new one is assigned", async () => {
    const auth = await bootAsAdultWithNoCampaign();
    // The new account's reads are held, so what is visible is only what the
    // switch itself left behind.
    const gate = deferred<Result>();
    tables.profiles = () => gate.promise;
    tables.campaign_members = () => gate.promise;
    childAccountsTable.resolve = () => gate.promise;

    authState.listener?.("SIGNED_IN", { user: { id: "u2", app_metadata: {} } });
    await nextTick();

    expect(auth.user?.id).toBe("u2");
    expect(auth.username).toBeNull();
    expect(auth.childLink).toBeNull();
    // Unknown, not "confirmed not a child": the gates must wait for u2's own answer.
    expect(auth.childLinkLoaded).toBe(false);
    expect(localStorage.getItem("grimoire:auth-snapshot")).toBeNull();
  });

  it("never saves the previous account's facts under the new account's id", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await bootAsAdultWithNoCampaign();
    // Every read for the new account fails, so nothing fresh can overwrite a bad snapshot.
    tables.profiles = async () => ({ data: null, error: new Error("offline") });
    tables.campaign_members = async () => ({ data: null, error: new Error("offline") });
    childAccountsTable.resolve = async () => ({ data: null, error: new Error("offline") });

    authState.listener?.("SIGNED_IN", { user: { id: "u2", app_metadata: {} } });
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));

    expect(readAuthSnapshot("u2", undefined)).toBeNull();
    errorSpy.mockRestore();
  });

  it("ignores an answer that comes back for the previous account", async () => {
    authState.session = { user: { id: "u1", app_metadata: {} } };
    const auth = useAuthStore();
    await auth.initialize();
    const late = deferred<Result>();
    tables.profiles = () => late.promise;
    authState.listener?.("TOKEN_REFRESHED", authState.session); // u1's reload, held
    await new Promise((r) => setTimeout(r, 5));

    tables.profiles = async () => ({ data: { username: "second" }, error: null });
    authState.listener?.("SIGNED_IN", { user: { id: "u2", app_metadata: {} } });
    await vi.waitFor(() => expect(auth.username).toBe("second"));

    late.resolve({ data: { username: "first" }, error: null });
    await new Promise((r) => setTimeout(r, 10));
    expect(auth.username).toBe("second");
  });

  it("keeps everything when the same user is announced again", async () => {
    const auth = await bootAsAdultWithNoCampaign();
    const gate = deferred<Result>();
    tables.profiles = () => gate.promise;
    authState.listener?.("SIGNED_IN", authState.session);
    await nextTick();
    expect(auth.username).toBe("the-parent");
    expect(auth.childLinkLoaded).toBe(true);
  });
});

describe("a failed membership read after a campaign switch", () => {
  async function bootInCampaign() {
    signedIn();
    tables.campaign_members = async () => ({ data: MEMBER, error: null });
    const auth = useAuthStore();
    await auth.initialize();
    expect(auth.isDM).toBe(true);
    return auth;
  }

  it("drops a membership that belongs to another campaign", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = await bootInCampaign();
    tables.campaign_members = async () => ({ data: null, error: new Error("offline") });

    await auth.refreshMembership("c2");

    // Not the DM of c1 carried into c2: the role is unknown until a read succeeds.
    expect(auth.membership).toBeNull();
    expect(auth.isDM).toBe(false);
    errorSpy.mockRestore();
  });

  it("keeps the membership when the failed read was for the same campaign", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const auth = await bootInCampaign();
    tables.campaign_members = async () => ({ data: null, error: new Error("offline") });

    await auth.refreshMembership("c1");

    expect(auth.membership).toEqual(MEMBER);
    errorSpy.mockRestore();
  });
});
