import { describe, it, expect } from "vitest";
import { computePackLots, type LedgerRowLite } from "./creditLots";

const NOW = new Date("2026-06-28T12:00:00Z").getTime();
const day = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

let seq = 0;
function row(p: Partial<LedgerRowLite>): LedgerRowLite {
  return {
    id: `r${seq++}`,
    delta: 0,
    reason: "spend",
    bucket: "purchased",
    pending: false,
    created_at: day(0),
    stripe_payment_intent_id: null,
    refunded_payment_intent_id: null,
    ...p,
  };
}

const pack = (pi: string, credits: number, ageDays: number) =>
  row({ reason: "pack_purchase", delta: credits, stripe_payment_intent_id: pi, created_at: day(ageDays) });
const spend = (amount: number, ageDays: number, extra: Partial<LedgerRowLite> = {}) =>
  row({ reason: "npc", delta: -amount, created_at: day(ageDays), ...extra });

describe("computePackLots", () => {
  it("marks an untouched, in-window pack as eligible with full remaining", () => {
    const [lot] = computePackLots([pack("pi_1", 1000, 2)], NOW);
    expect(lot).toMatchObject({ credits: 1000, remaining: 1000, consumed: 0, withinWindow: true, eligible: true });
  });

  it("is ineligible when any of the pack's credits are spent (FIFO)", () => {
    const [lot] = computePackLots([pack("pi_1", 1000, 2), spend(200, 1)], NOW);
    expect(lot.remaining).toBe(800);
    expect(lot.consumed).toBe(200);
    expect(lot.eligible).toBe(false);
  });

  it("consumes the oldest pack first across two packs", () => {
    const rows = [pack("pi_old", 1000, 10), pack("pi_new", 400, 1), spend(1100, 0)];
    const lots = computePackLots(rows, NOW);
    const byPi = Object.fromEntries(lots.map((l) => [l.paymentIntentId, l]));
    expect(byPi["pi_old"].remaining).toBe(0); // fully consumed first
    expect(byPi["pi_new"].remaining).toBe(300); // only 100 spilled into the newer pack
    expect(byPi["pi_new"].eligible).toBe(false);
  });

  it("falls outside the window after 14 days", () => {
    const [lot] = computePackLots([pack("pi_1", 1000, 20)], NOW);
    expect(lot.withinWindow).toBe(false);
    expect(lot.eligible).toBe(false);
  });

  it("excludes pending holds from spend", () => {
    const rows = [pack("pi_1", 1000, 2), spend(300, 0, { pending: true })];
    expect(computePackLots(rows, NOW)[0].remaining).toBe(1000);
  });

  it("ignores subscription-bucket rows entirely", () => {
    const rows = [
      pack("pi_1", 1000, 2),
      row({ reason: "subscription_topup", delta: 1500, bucket: "subscription", created_at: day(3) }),
      row({ reason: "npc", delta: -500, bucket: "subscription", created_at: day(1) }),
    ];
    expect(computePackLots(rows, NOW)[0].remaining).toBe(1000);
  });

  it("treats a refunded pack as gone and leaves other packs untouched", () => {
    const rows = [
      pack("pi_a", 1000, 5),
      pack("pi_b", 400, 2),
      row({ reason: "pack_refund", delta: -1000, refunded_payment_intent_id: "pi_a", created_at: day(1) }),
    ];
    const lots = computePackLots(rows, NOW);
    const byPi = Object.fromEntries(lots.map((l) => [l.paymentIntentId, l]));
    expect(byPi["pi_a"]).toMatchObject({ alreadyRefunded: true, remaining: 0, eligible: false });
    // pi_b must NOT be consumed by pi_a's clawback
    expect(byPi["pi_b"]).toMatchObject({ remaining: 400, eligible: true });
  });

  it("does not count admin grants as refundable packs but does let them absorb spend", () => {
    const rows = [
      row({ reason: "admin_grant", delta: 500, created_at: day(10) }),
      pack("pi_1", 1000, 2),
      spend(500, 0),
    ];
    const lots = computePackLots(rows, NOW);
    expect(lots).toHaveLength(1); // only the pack purchase is listed
    expect(lots[0].paymentIntentId).toBe("pi_1");
    expect(lots[0].remaining).toBe(1000); // the older admin grant absorbed the spend
  });
});
