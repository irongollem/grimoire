import { describe, expect, it } from "vitest";
import { canStartProCheckout, isCancellationPending } from "./useSubscription";

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
