import { describe, expect, it, vi } from "vitest";
import { FREE_ASKS_PER_DAY } from "./askContract.ts";
import { reserveFor, settleAnswer, settleEarlierRoutes } from "./askBilling.ts";
import type { JobLedger } from "../pipeline/creditHold.ts";

describe("reserveFor", () => {
  it("holds nothing while a free answer is left, and one credit once none is", () => {
    expect(reserveFor({ freeLeft: 1, isByok: false })).toBe(0);
    expect(reserveFor({ freeLeft: 0, isByok: false })).toBe(1);
  });
  it("holds nothing for an own key, whatever the day's count", () => {
    expect(reserveFor({ freeLeft: 0, isByok: true })).toBe(0);
  });
});

describe("settleEarlierRoutes", () => {
  it("never settles an own-key account: its routes are never written", async () => {
    const settleRoutes = vi.fn();
    expect(await settleEarlierRoutes({ userId: "u", isByok: true, settleRoutes })).toEqual({ credits: 0, freeLeft: 0 });
    expect(settleRoutes).not.toHaveBeenCalled();
  });
  it("answers what the database settled", async () => {
    expect(await settleEarlierRoutes({ userId: "u", isByok: false, settleRoutes: async () => ({ credits: 2, freeLeft: 0 }) })).toEqual({ credits: 2, freeLeft: 0 });
  });
  it("owes nothing, and keeps the free answers, when settlement fails", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await settleEarlierRoutes({ userId: "u", isByok: false, settleRoutes: async () => { throw new Error("db"); } })).toEqual({ credits: 0, freeLeft: FREE_ASKS_PER_DAY });
    quiet.mockRestore();
  });
});

function ledger() {
  const lines: Array<{ kind: string; reason: string; cost?: number; isByok?: boolean }> = [];
  const l: JobLedger = {
    charge: (reason, line) => { lines.push({ kind: "charge", reason, cost: line.cost, isByok: line.isByok }); },
    free: (reason) => { lines.push({ kind: "free", reason }); },
  };
  return { l, lines };
}
const base = { userId: "u", isByok: false, accrued: 0.7, freeLeft: 5, log: {} };

describe("settleAnswer", () => {
  it("does not charge or count a routed turn, and writes its cost as a free ledger line", async () => {
    const { l, lines } = ledger();
    const chargeAnswer = vi.fn();
    const out = await settleAnswer({ ...base, routed: true, ledger: l, chargeAnswer });
    expect(chargeAnswer).not.toHaveBeenCalled();
    expect(lines).toEqual([{ kind: "charge", reason: "ask_routing", cost: 0, isByok: false }]);
    expect(out).toEqual({ routed: true, free: false, credits: 0, freeLeft: 5 });
  });

  it("settles an answer with the measured credits and spends exactly the whole credits the database says", async () => {
    const { l, lines } = ledger();
    const chargeAnswer = vi.fn(async () => ({ free: false, credits: 3, freeLeft: 0 }));
    const out = await settleAnswer({ ...base, accrued: 3.4, freeLeft: 0, routed: false, ledger: l, chargeAnswer });
    expect(chargeAnswer).toHaveBeenCalledWith("u", 3.4);
    expect(lines).toEqual([{ kind: "charge", reason: "ask_answer", cost: 3, isByok: false }]);
    expect(out).toEqual({ routed: false, free: false, credits: 3, freeLeft: 0 });
  });

  it("writes a free answer at no cost and says how many are left", async () => {
    const { l, lines } = ledger();
    const out = await settleAnswer({ ...base, routed: false, ledger: l, chargeAnswer: async () => ({ free: true, credits: 0, freeLeft: 4 }) });
    expect(lines).toEqual([{ kind: "charge", reason: "ask_answer", cost: 0, isByok: false }]);
    expect(out).toEqual({ routed: false, free: true, credits: 0, freeLeft: 4 });
  });

  it("does not meter or count an own-key answer", async () => {
    const { l, lines } = ledger();
    const chargeAnswer = vi.fn();
    const out = await settleAnswer({ ...base, isByok: true, routed: false, ledger: l, chargeAnswer });
    expect(chargeAnswer).not.toHaveBeenCalled();
    expect(lines).toEqual([{ kind: "charge", reason: "ask_answer", cost: 0, isByok: true }]);
    expect(out.credits).toBe(0);
  });

  it("costs the platform and never the DM when the database cannot settle the answer", async () => {
    const { l, lines } = ledger();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await settleAnswer({ ...base, routed: false, ledger: l, chargeAnswer: async () => { throw new Error("db down"); } });
    quiet.mockRestore();
    expect(lines).toEqual([{ kind: "free", reason: "ask_answer" }]);
    expect(out).toMatchObject({ credits: 0, free: true });
  });
});
