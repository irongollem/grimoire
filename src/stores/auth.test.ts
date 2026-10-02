import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * The child-account link (#919): loading it, resetting it, and the
 * `isChildAccount` computed built on top of it. This is the identity fact
 * `useCampaignStore().isAiEnabled` reads directly (a Pinia computed cannot
 * open the `useQuery`-backed `useChildAccount()` composable), so a wrong
 * answer here re-enables AI UI for a child DM.
 */
const { childAccountsTable, authCalls } = vi.hoisted(() => ({
  childAccountsTable: {
    resolve: async () => ({ data: null as unknown, error: null as unknown }),
  },
  authCalls: {
    signInWithPassword: vi.fn(),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
      ...authCalls,
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
  authCalls.signInWithPassword.mockResolvedValue({ data: { user: null, session: null }, error: null });
  authCalls.signUp.mockResolvedValue({ error: null });
  authCalls.resetPasswordForEmail.mockResolvedValue({ error: null });
});

/**
 * Supabase Auth's CAPTCHA protection is project-wide: once on, each of these
 * three calls is refused without a token, so one that forgets to send it is a
 * form nobody can use.
 */
describe("the bot-check token", () => {
  const captcha = async () => "tok";

  it("rides on sign-in", async () => {
    await useAuthStore().signIn("someone@example.invalid", "pw", captcha);
    expect(authCalls.signInWithPassword.mock.calls[0][0].options).toEqual({ captchaToken: "tok" });
  });

  it("rides on sign-up, beside the consent metadata", async () => {
    await useAuthStore().signUp({ email: "someone@example.invalid", password: "pw", captcha });
    const { options } = authCalls.signUp.mock.calls[0][0];
    expect(options.captchaToken).toBe("tok");
    expect(options.data.terms_version).toBeTruthy();
  });

  it("rides on a password-reset request", async () => {
    await useAuthStore().requestPasswordReset("someone@example.invalid", captcha);
    expect(authCalls.resetPasswordForEmail.mock.calls[0][1].captchaToken).toBe("tok");
  });

  it("keeps the store loading while the check is still running, then makes the call", async () => {
    const auth = useAuthStore();
    let release: (token: string) => void = () => {};
    const pending = auth.signIn("someone@example.invalid", "pw", () => new Promise((resolve) => (release = resolve)));

    expect(auth.loading).toBe(true);
    expect(authCalls.signInWithPassword).not.toHaveBeenCalled();

    release("tok");
    await pending;
    expect(auth.loading).toBe(false);
    expect(authCalls.signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("stops loading and makes no call when the check fails", async () => {
    const auth = useAuthStore();
    await expect(auth.signIn("someone@example.invalid", "pw", () => Promise.reject(new Error("blocked")))).rejects.toThrow("blocked");

    expect(auth.loading).toBe(false);
    expect(authCalls.signInWithPassword).not.toHaveBeenCalled();
  });
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
