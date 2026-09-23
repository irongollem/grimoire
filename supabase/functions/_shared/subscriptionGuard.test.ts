import { describe, expect, it } from "vitest";
import { hasLiveStripeSubscription } from "./subscriptionGuard";

describe("hasLiveStripeSubscription", () => {
  it("is false for a free user, whose row defaults to status 'active' (#905)", () => {
    expect(hasLiveStripeSubscription({ stripe_subscription_id: null, status: "active" })).toBe(false);
  });

  it("is false without a row", () => {
    expect(hasLiveStripeSubscription(null)).toBe(false);
  });

  it.each(["active", "trialing", "past_due", "unpaid", "paused"])(
    "is true for a Stripe subscription that is %s",
    (status) => {
      expect(hasLiveStripeSubscription({ stripe_subscription_id: "sub_1", status })).toBe(true);
    },
  );

  it.each(["canceled", "incomplete", "incomplete_expired"])(
    "is false for a Stripe subscription that is %s",
    (status) => {
      expect(hasLiveStripeSubscription({ stripe_subscription_id: "sub_1", status })).toBe(false);
    },
  );
});
