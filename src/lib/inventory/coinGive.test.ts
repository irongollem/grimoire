import { describe, expect, it } from "vitest";
import { DND5E_CURRENCY } from "@/systems/dnd5e/currency/dnd5eCurrency";
import type { CurrencyConfig } from "@/lib/currency/currency";
import { coinGiveBlocked, coinsLeft, giveCoinsLabel, leavesLine } from "./coinGive";

const purse = { gp: 41, sp: 12, cp: 30 };

const DOLLARS: CurrencyConfig = {
  default_key: "dollar",
  denominations: [
    { key: "dollar", name: "dollar", abbr: "$", value: 100, color: "#00aa00", makes_change: true },
    { key: "cent", name: "cent", abbr: "c", value: 1, color: "#aa7700", makes_change: true },
  ],
};

describe("coinGive", () => {
  it("subtracts what is given", () => {
    expect(coinsLeft(purse, { gp: 5 })).toEqual({ ...purse, gp: 36 });
  });
  it("never adds coins back for a negative entry", () => {
    expect(coinsLeft(purse, { gp: -5 })).toEqual(purse);
  });
  it("words what is left, skipping empty coins", () => {
    expect(leavesLine(purse, { gp: 5 }, DND5E_CURRENCY, null)).toBe("Leaves you 36 gp 12 sp 30 cp.");
    expect(leavesLine({ gp: 2 }, { gp: 2 }, DND5E_CURRENCY, null)).toBe("Leaves you with nothing.");
  });
  // A DM on a character's purse moved that character's coins while reading "you"
  // as their own money (13 Nov 2026): someone else's purse names them.
  it("names the giver when the purse is not the viewer's own", () => {
    expect(leavesLine(purse, { gp: 5 }, DND5E_CURRENCY, "Dorn")).toBe("Leaves Dorn 36 gp 12 sp 30 cp.");
    expect(leavesLine({ gp: 2 }, { gp: 2 }, DND5E_CURRENCY, "Dorn")).toBe("Leaves Dorn with nothing.");
  });
  it("blocks an amount above the purse or below zero, allows the exact purse", () => {
    expect(coinGiveBlocked(purse, { gp: 42 })).toBe(true);
    expect(coinGiveBlocked(purse, { gp: -1 })).toBe(true);
    expect(coinGiveBlocked(purse, { gp: 41 })).toBe(false);
  });
  it("blocks a coin the purse does not hold at all", () => {
    expect(coinGiveBlocked({ gp: 5 }, { pp: 1 })).toBe(true);
  });
  it("labels the button with the amount and the recipient", () => {
    expect(giveCoinsLabel({ gp: 5, sp: 3 }, "Dorn", DND5E_CURRENCY)).toBe("Give 5 gp 3 sp to Dorn");
    expect(giveCoinsLabel({}, "Dorn", DND5E_CURRENCY)).toBe("Give");
    expect(giveCoinsLabel({ gp: 5 }, null, DND5E_CURRENCY)).toBe("Give 5 gp");
  });
  it("speaks the campaign's own coins, not gold", () => {
    expect(giveCoinsLabel({ dollar: 2, cent: 50 }, "Mia", DOLLARS)).toBe("Give 2 $ 50 c to Mia");
    expect(leavesLine({ dollar: 3 }, { dollar: 1 }, DOLLARS, null)).toBe("Leaves you 2 $.");
  });
});
