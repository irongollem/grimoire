import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent } from "vue";
import type { UserSubscription } from "@/types/subscription.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const session = vi.hoisted(() => ({
  auth: { user: { id: "me" } as { id: string } | null, isAppAdmin: false },
  isChild: { value: false },
}));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => session.auth }));
vi.mock("@/composables/account/useChildAccount", () => ({
  useChildAccount: () => ({ isChild: session.isChild }),
}));

import { canStartProCheckout, isCancellationPending, useSubscription } from "./useSubscription";

describe("canStartProCheckout", () => {
  it("lets a free account upgrade", () => {
    expect(canStartProCheckout({ plan_id: "free" })).toBe(true);
  });

  it("lets a beta tester move to paid, although isPro already counts them", () => {
    expect(canStartProCheckout({ plan_id: "tester" })).toBe(true);
  });

  it("lets an account without a subscription row upgrade", () => {
    expect(canStartProCheckout(null)).toBe(true);
  });

  it("refuses a pro account, which already has its subscription", () => {
    expect(canStartProCheckout({ plan_id: "pro" })).toBe(false);
  });
});

describe("isCancellationPending", () => {
  it("sees a portal cancellation, which sets cancel_at and leaves cancel_at_period_end false", () => {
    expect(isCancellationPending({ cancel_at: "2026-10-23T17:21:28Z", status: "active" })).toBe(true);
  });

  it("is false for a subscription that simply renews", () => {
    expect(isCancellationPending({ cancel_at: null, status: "active" })).toBe(false);
  });

  it("is false once the subscription has actually ended", () => {
    expect(isCancellationPending({ cancel_at: "2026-10-23T17:21:28Z", status: "canceled" })).toBe(false);
  });

  it("is false without a row", () => {
    expect(isCancellationPending(null)).toBe(false);
  });
});

function sub(overrides: Partial<UserSubscription> = {}) {
  const base: UserSubscription = {
    user_id: "me",
    plan_id: "free",
    status: "active",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_end: null,
    cancel_at_period_end: false,
    cancel_at: null,
    suspended_at: null,
    suspension_reason: null,
    terms_version: null,
    terms_accepted_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
  return { ...base, ...overrides };
}

function run() {
  let result!: ReturnType<typeof useSubscription>;
  const app = createApp(
    defineComponent({
      setup() {
        result = useSubscription();
        return () => null;
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) });
  app.mount(document.createElement("div"));
  return result;
}

describe("useSubscription", () => {
  beforeEach(() => {
    fake.reset();
    session.auth.user = { id: "me" };
    session.auth.isAppAdmin = false;
    session.isChild.value = false;
  });

  // 28 Sep 2026: the admin's select policy returns every account's row, and an
  // unfiltered maybeSingle() then failed for the admin alone.
  it("reads the caller's own row even when the policy lets the account see everyone's", async () => {
    fake.seed("user_subscriptions", [
      sub({ user_id: "someone-else", plan_id: "pro" }),
      sub({ user_id: "me", plan_id: "free", terms_version: "2026-09-28" }),
      sub({ user_id: "a-third", plan_id: "tester" }),
    ]);
    session.auth.isAppAdmin = true;
    const s = run();
    await vi.waitFor(() => expect(s.subscription.value).toBeDefined());
    expect(s.subscription.value).toMatchObject({ user_id: "me", terms_version: "2026-09-28" });
    expect(s.error.value).toBeNull();
  });

  it("surfaces a failed read as an error, not as an account with no subscription", async () => {
    fake.seed("user_subscriptions", [sub()]);
    fake.failNext("user_subscriptions", { message: "boom" });
    const s = run();
    await vi.waitFor(() => expect(s.error.value).not.toBeNull());
    expect(s.subscription.value).toBeUndefined();
  });

  it("does not read at all while signed out", async () => {
    session.auth.user = null;
    fake.seed("user_subscriptions", [sub()]);
    const s = run();
    await new Promise((r) => setTimeout(r, 0));
    expect(s.subscription.value).toBeUndefined();
    expect(s.error.value).toBeNull();
    expect(fake.calls).toEqual([]);
  });

  describe("isPro", () => {
    it.each([
      ["a pro plan that is active", { plan_id: "pro", status: "active" }, true],
      ["a pro plan in trial", { plan_id: "pro", status: "trialing" }, true],
      ["a tester comp", { plan_id: "tester", status: "active" }, true],
      ["a pro plan whose payment lapsed", { plan_id: "pro", status: "past_due" }, false],
      ["a pro plan that was canceled", { plan_id: "pro", status: "canceled" }, false],
      ["the free plan", { plan_id: "free", status: "active" }, false],
    ] as const)("%s", async (_label, row, expected) => {
      fake.seed("user_subscriptions", [sub(row)]);
      const s = run();
      await vi.waitFor(() => expect(s.subscription.value).toBeDefined());
      expect(s.isPro.value).toBe(expected);
    });

    it("counts the admin as Pro with no subscription row", () => {
      session.auth.isAppAdmin = true;
      expect(run().isPro.value).toBe(true);
    });

    it("never counts a child as Pro, even on a pro plan or as admin (#919)", async () => {
      fake.seed("user_subscriptions", [sub({ plan_id: "pro" })]);
      session.isChild.value = true;
      session.auth.isAppAdmin = true;
      const s = run();
      await vi.waitFor(() => expect(s.subscription.value).toBeDefined());
      expect(s.isPro.value).toBe(false);
    });
  });

  it("reports a suspension with its reason, and none for a clean account", async () => {
    fake.seed("user_subscriptions", [sub({ suspended_at: "2026-10-01T00:00:00Z", suspension_reason: "chargeback" })]);
    const s = run();
    await vi.waitFor(() => expect(s.subscription.value).toBeDefined());
    expect(s.isSuspended.value).toBe(true);
    expect(s.suspensionReason.value).toBe("chargeback");
  });

  it("is not suspended without a row", () => {
    const s = run();
    expect(s.isSuspended.value).toBe(false);
    expect(s.suspensionReason.value).toBeNull();
  });
});
