import { describe, expect, it } from "vitest";
import {
  legacyCoins,
  upgradeEncounterCoins,
  upgradeLootTableCoins,
  upgradePartyMemberCoins,
} from "./legacyCoins";

describe("legacyCoins", () => {
  it("keeps only positive whole counts, so a zero or negative purse column never becomes a coin", () => {
    expect(legacyCoins({ pp: 0, gp: 12.9, ep: -3, sp: "4", cp: 7 })).toEqual({ gp: 12, cp: 7 });
  });
});

describe("upgradePartyMemberCoins", () => {
  it("moves the five columns into coins and drops them (the insert would fail on a dropped column)", () => {
    const out = upgradePartyMemberCoins({ id: "pm", name: "Ro", pp: 0, gp: 25, ep: 0, sp: 3, cp: 0 });
    expect(out).toEqual({ id: "pm", name: "Ro", coins: { gp: 25, sp: 3 } });
    expect(Object.keys(out)).not.toContain("gp");
  });

  it("leaves a current member, whose coins are already a map, untouched", () => {
    const member = { id: "pm", coins: { dollar: 2 } };
    expect(upgradePartyMemberCoins(member)).toBe(member);
  });
});

describe("upgradeLootTableCoins", () => {
  it("converts currency entries and leaves other entries alone", () => {
    const item = { type: "item", item_id: "i1", drop_chance: 50 };
    const out = upgradeLootTableCoins({
      id: "lt",
      entries: [{ type: "currency", currency_label: "Purse", drop_chance: 100, gp: 10, sp: 5, cp: 0, notes: "n" }, item],
    });
    expect(out.entries).toEqual([
      { type: "currency", currency_label: "Purse", drop_chance: 100, coins: { gp: 10, sp: 5 }, notes: "n" },
      item,
    ]);
  });
});

describe("upgradeEncounterCoins", () => {
  it("turns each reward pool into id, label and coins", () => {
    const out = upgradeEncounterCoins({
      id: "e",
      reward_currency_pools: [{ id: "p1", label: "Hoard", pp: 1, gp: 200, ep: 0, sp: 0, cp: 0 }],
    });
    expect(out.reward_currency_pools).toEqual([{ id: "p1", label: "Hoard", coins: { pp: 1, gp: 200 } }]);
  });

  it("does not invent a pools column on an encounter that has none", () => {
    expect(upgradeEncounterCoins({ id: "e" })).toEqual({ id: "e" });
  });
});
