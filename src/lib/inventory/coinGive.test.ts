import { describe, expect, it } from "vitest";
import { coinGiveBlocked, coinText, coinsLeft, giveCoinsLabel, hasCoins, leavesYouLine, wholeCoins } from "./coinGive";

const purse = { pp: 0, gp: 41, ep: 0, sp: 12, cp: 30 };
const none = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };

describe("coinGive", () => {
  it("subtracts what is given", () => {
    expect(coinsLeft(purse, { ...none, gp: 5 })).toEqual({ ...purse, gp: 36 });
  });
  it("words what is left, skipping empty coins", () => {
    expect(leavesYouLine(purse, { ...none, gp: 5 })).toBe("Leaves you 36 gp, 12 sp, 30 cp.");
    expect(leavesYouLine({ ...none, gp: 2 }, { ...none, gp: 2 })).toBe("Leaves you with nothing.");
  });
  it("blocks an amount above the purse or below zero, allows the exact purse", () => {
    expect(coinGiveBlocked(purse, { ...none, gp: 42 })).toBe(true);
    expect(coinGiveBlocked(purse, { ...none, gp: -1 })).toBe(true);
    expect(coinGiveBlocked(purse, { ...none, gp: 41 })).toBe(false);
  });
  it("knows when nothing is entered", () => {
    expect(hasCoins(none)).toBe(false);
    expect(hasCoins({ ...none, cp: 1 })).toBe(true);
  });
  it("labels the button with the amount and the recipient", () => {
    expect(giveCoinsLabel({ ...none, gp: 5, sp: 3 }, "Dorn")).toBe("Give 5 gp, 3 sp to Dorn");
    expect(giveCoinsLabel(none, "Dorn")).toBe("Give");
    expect(giveCoinsLabel({ ...none, gp: 5 }, null)).toBe("Give 5 gp");
  });
  it("floors fractions and treats NaN as zero", () => {
    expect(wholeCoins({ ...none, gp: 2.9, sp: Number.NaN })).toEqual({ ...none, gp: 2 });
    expect(coinText({ ...none, pp: 1 })).toBe("1 pp");
  });
});
