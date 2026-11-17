import { describe, expect, it } from "vitest";
import {
  handsLine, parseBuy, parseCoins, parseHandOver, parseTake, possessionsSection, purseAfterPaying, type Coins, type Ware,
} from "./hands.ts";

const HONEYCOMB = "f5f67a48-5233-473b-84a3-5eb024491c86";
// A campaign's coins in the smallest one: 1 gp = 100 cp, 1 sp = 10 cp (PHB 2014 "Coinage").
const VALUES = new Map([["gp", 100], ["sp", 10], ["cp", 1]]);
const text = (coins: Coins) => Object.entries(coins).map(([k, n]) => `${n} ${k}`).join(" ");
// Greedy change, as the campaign's own helper gives it.
const change = (value: number): Coins => {
  const out: Coins = {};
  let left = value;
  for (const [key, each] of VALUES) {
    const n = Math.floor(left / each);
    if (n > 0) out[key] = n;
    left -= n * each;
  }
  return out;
};

describe("parseHandOver", () => {
  // Bug caught: a thing "handed over" between two characters, or to nobody, moving into the player's pack.
  it("needs exactly one side to be the player's character", () => {
    expect(parseHandOver({ giver: HONEYCOMB, receiver: "player", thing: "Workshop Keys" })).toMatchObject({ ok: true, value: { direction: "to_player", characterId: HONEYCOMB, quantity: 1 } });
    expect(parseHandOver({ giver: "player", receiver: HONEYCOMB, thing: "Rope", quantity: 2 })).toMatchObject({ ok: true, value: { direction: "from_player", quantity: 2 } });
    expect(parseHandOver({ giver: "player", receiver: "player", thing: "Rope" }).ok).toBe(false);
    expect(parseHandOver({ giver: HONEYCOMB, receiver: HONEYCOMB, thing: "Rope" }).ok).toBe(false);
    expect(parseHandOver({ giver: "Honeycomb", receiver: "player", thing: "Rope" }).ok).toBe(false);
  });
});

describe("parseTake", () => {
  // Bug caught: a "+3 sword" picked up by name alone; an item id and a name given together (which wins?).
  it("takes one of the campaign's items by id, or a plain object by name, never both and never neither", () => {
    expect(parseTake({ item_id: HONEYCOMB })).toMatchObject({ ok: true, value: { itemId: HONEYCOMB, name: null } });
    expect(parseTake({ name: "A shard of the tea-service" })).toMatchObject({ ok: true, value: { itemId: null, name: "A shard of the tea-service" } });
    expect(parseTake({ item_id: HONEYCOMB, name: "A key" }).ok).toBe(false);
    expect(parseTake({}).ok).toBe(false);
    expect(parseTake({ item_id: "the key" }).ok).toBe(false);
  });
});

describe("parseCoins", () => {
  const ctx = { coinValues: VALUES, purse: { gp: 2, sp: 5 }, lastRoll: null };

  // Bug caught: a payment told that the purse could not cover. 2 gp 5 sp is 250 cp; 3 gp is 300.
  it("refuses a payment worth more than the purse, and takes one it covers even from other coins", () => {
    expect(parseCoins({ change: "pay", coin: "gp", amount: 3, why: "A toll" }, ctx).ok).toBe(false);
    // 25 sp is exactly the purse's worth, though it holds only 5 sp: the gold makes up the rest.
    expect(parseCoins({ change: "pay", coin: "sp", amount: 25, why: "A toll" }, ctx)).toMatchObject({ ok: true, value: { kind: "pay", coins: { sp: 25 } } });
  });

  // Bug caught: the narrator naming a hoard. A gain is the roll, whatever amount is typed.
  it("gains the narrator's roll and nothing else", () => {
    expect(parseCoins({ change: "gain", coin: "gp", amount: 500, why: "The hoard" }, ctx).ok).toBe(false);
    expect(parseCoins({ change: "gain", coin: "gp", amount: 500, why: "The hoard" }, { ...ctx, lastRoll: 7 })).toMatchObject({ ok: true, value: { kind: "gain", coins: { gp: 7 } } });
  });

  // Bug caught: coins of a currency the campaign does not have entering the purse.
  it("refuses a coin the campaign does not name", () => {
    expect(parseCoins({ change: "pay", coin: "dollars", amount: 1, why: "A toll" }, ctx).ok).toBe(false);
  });
});

describe("parseBuy", () => {
  const lantern: Ware = { name: "Lantern", ref: { itemId: HONEYCOMB, libraryItemId: null }, price: { gp: 3 }, priceText: "3 gp" };
  const heirloom: Ware = { name: "Heirloom", ref: { itemId: null, libraryItemId: "lib_heirloom" }, price: null, priceText: "priceless" };
  const ctx = { wares: [lantern, heirloom], coinValues: VALUES, purse: { gp: 7 } };

  // Bug caught: the price for one charged for two; a purchase the purse cannot cover going through.
  it("charges the shop's price for as many as are bought, and refuses what the purse cannot cover", () => {
    expect(parseBuy({ thing: "lantern", quantity: 2 }, ctx)).toMatchObject({ ok: true, value: { thing: "Lantern", quantity: 2, price: { gp: 6 } } });
    expect(parseBuy({ thing: "Lantern", quantity: 3 }, ctx).ok).toBe(false);
  });

  // Bug caught: a ware the shop does not stock sold at a price the narrator made up; a ware with no readable
  // price sold for nothing.
  it("sells only what is stocked here, at a price that can be read", () => {
    expect(parseBuy({ thing: "Dragon egg" }, ctx).ok).toBe(false);
    expect(parseBuy({ thing: "Heirloom" }, ctx).ok).toBe(false);
    expect(parseBuy({ thing: "Lantern" }, { ...ctx, wares: [] }).ok).toBe(false);
  });
});

describe("purseAfterPaying", () => {
  // Bug caught: change-making applied to a purse that held the exact coins (a purse of 12 sp turned into 1 gp 2 sp
  // for paying 2 sp), or a short purse going negative.
  it("pays from the coins named when it holds them, counts the purse out again when it does not, and never goes below nothing", () => {
    expect(purseAfterPaying({ gp: 1, sp: 12 }, { sp: 2 }, VALUES, change)).toEqual({ gp: 1, sp: 10 });
    // 1 gp minus 3 sp is 70 cp: 7 sp.
    expect(purseAfterPaying({ gp: 1 }, { sp: 3 }, VALUES, change)).toEqual({ sp: 7 });
    expect(purseAfterPaying({ sp: 2 }, { gp: 1 }, VALUES, change)).toBeNull();
    // The last coin leaves no empty entry behind.
    expect(purseAfterPaying({ gp: 1 }, { gp: 1 }, VALUES, change)).toEqual({});
  });
});

describe("what the page and the narrator are told", () => {
  // Bug caught: giver and receiver the wrong way round in the story's margin.
  it("says who gave what to whom", () => {
    expect(handsLine({ kind: "to_player", from: { id: HONEYCOMB, name: "Honeycomb" }, thing: "Workshop Keys", quantity: 1 }, "Rosie", text)).toBe("Honeycomb gives Rosie: Workshop Keys");
    expect(handsLine({ kind: "from_player", to: { id: HONEYCOMB, name: "Honeycomb" }, thing: "Rope", quantity: 2 }, "Rosie", text)).toBe("Rosie gives Honeycomb: 2 × Rope");
  });

  // Bug caught: an empty purse shown as nothing at all (the narrator then lets the player pay); wares listed
  // where there are none.
  it("says the purse is empty, lists what is carried, and lists wares only where something is for sale", () => {
    const bare = possessionsSection({ carried: [], more: 0, purse: {}, wares: [] }, text);
    expect(bare).toContain("Purse: empty.");
    expect(bare).not.toContain("For sale here");
    const shop = possessionsSection({ carried: [{ name: "Rope", quantity: 2 }], more: 0, purse: { gp: 5 }, wares: [{ name: "Lantern", ref: { itemId: null, libraryItemId: null }, price: { gp: 3 }, priceText: "3 gp" }] }, text);
    expect(shop).toContain("Rope (2)");
    expect(shop).toContain("- Lantern: 3 gp");
    expect(possessionsSection(null, text)).toBe("");
  });
});
