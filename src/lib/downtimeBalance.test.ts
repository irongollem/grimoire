import { describe, it, expect } from "vitest";
import { computeBalance } from "@/lib/downtimeBalance";
import type { DowntimeDraw, DowntimeGrant, DowntimeDrawStatus } from "@/types/downtime.types";

const ISO = "2026-07-10T00:00:00.000Z";

function grant(amount: number): DowntimeGrant {
  return {
    id: crypto.randomUUID(),
    campaign_id: "c1",
    party_member_id: "pm1",
    granted_by: "dm1",
    amount,
    reason: null,
    created_at: ISO,
    updated_at: ISO,
  };
}

function draw(status: DowntimeDrawStatus): DowntimeDraw {
  return {
    id: crypto.randomUUID(),
    campaign_id: "c1",
    party_member_id: "pm1",
    activity_key: "carouse",
    status,
    created_at: ISO,
    updated_at: ISO,
    resolved_at: status === "resolved" ? ISO : null,
  };
}

describe("computeBalance", () => {
  it("is zero with no grants and no draws", () => {
    expect(computeBalance([], [])).toBe(0);
  });

  it("sums grant amounts", () => {
    expect(computeBalance([grant(1), grant(2)], [])).toBe(3);
  });

  it("subtracts one credit per pending draw", () => {
    expect(computeBalance([grant(3)], [draw("pending")])).toBe(2);
  });

  it("subtracts one credit per resolved draw — a spent credit stays spent", () => {
    expect(computeBalance([grant(3)], [draw("resolved")])).toBe(2);
  });

  it("refunds cancelled draws", () => {
    expect(computeBalance([grant(1)], [draw("cancelled")])).toBe(1);
  });

  it("counts a mixed ledger correctly", () => {
    const grants = [grant(2), grant(3)]; // 5 granted
    const draws = [
      draw("pending"),
      draw("resolved"),
      draw("cancelled"), // refunded, not counted
    ];
    expect(computeBalance(grants, draws)).toBe(3);
  });

  it("clamps at zero rather than reporting a negative balance", () => {
    expect(computeBalance([grant(1)], [draw("pending"), draw("resolved")])).toBe(0);
  });

  it("honours grants larger than one credit", () => {
    expect(computeBalance([grant(5)], [draw("pending")])).toBe(4);
  });
});
