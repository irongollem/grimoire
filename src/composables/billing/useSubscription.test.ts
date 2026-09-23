import { describe, expect, it } from "vitest";
import { canStartProCheckout } from "./useSubscription";

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
