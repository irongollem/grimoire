import { describe, expect, it } from "vitest";
import {
  chestOf, chestPick, handsLine, handsText, parseBuy, parseCoins, parseHandOver, parseTake, possessionsSection, purseAfterPaying, type Coins, type Ware,
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
    expect(parseTake({ item_id: HONEYCOMB })).toMatchObject({ ok: true, value: { itemId: HONEYCOMB, name: null, placementId: null } });
    // Something the campaign placed is found by its placement, and by nothing else in the same call.
    expect(parseTake({ placement_id: HONEYCOMB })).toMatchObject({ ok: true, value: { placementId: HONEYCOMB, itemId: null, name: null } });
    expect(parseTake({ placement_id: HONEYCOMB, name: "A key" }).ok).toBe(false);
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
    const bare = possessionsSection({ carried: [], more: 0, purse: {}, wares: [], loot: [] }, text);
    expect(bare).toContain("Purse: empty.");
    expect(bare).not.toContain("For sale here");
    const shop = possessionsSection({ carried: [{ name: "Rope", quantity: 2 }], more: 0, purse: { gp: 5 }, wares: [{ name: "Lantern", ref: { itemId: null, libraryItemId: null }, price: { gp: 3 }, priceText: "3 gp" }], loot: [] }, text);
    expect(shop).toContain("Rope (2)");
    expect(shop).toContain("- Lantern: 3 gp");
    expect(possessionsSection(null, text)).toBe("");
  });

  // Bug caught: prepared loot the narrator cannot see (a body searched for nothing), or listed with no id to take
  // it by; a purse listed as an item.
  it("lists what the campaign placed within reach, each with the id it is taken by", () => {
    const section = possessionsSection({
      carried: [], more: 0, purse: {}, wares: [],
      loot: [
        { id: "p-key", name: "Tower-Door Key", quantity: 1, ref: { itemId: "i1", libraryItemId: null }, coins: null, beat: "The Landing" },
        { id: "p-purse", name: "The sentry's purse", quantity: 1, ref: { itemId: null, libraryItemId: null }, coins: { gp: 12 }, beat: null },
      ],
    }, text);
    expect(section).toContain('- Tower-Door Key, at "The Landing" [placement_id p-key]');
    expect(section).toContain("- 12 gp (The sentry's purse) [placement_id p-purse]");
  });

  // Bug caught: found coins told as an item, or a found item told without what it was.
  it("tells a find in the margin: coins as coins, a thing by its name", () => {
    expect(handsLine({ kind: "loot", placementId: "p", thing: "Tower-Door Key", quantity: 1, ref: { itemId: "i1", libraryItemId: null }, coins: null }, "Rosie", text)).toBe("Rosie finds: Tower-Door Key");
    expect(handsLine({ kind: "loot", placementId: "p", thing: "The sentry's purse", quantity: 1, ref: { itemId: null, libraryItemId: null }, coins: { gp: 12 } }, "Rosie", text)).toBe("Rosie finds 12 gp: The sentry's purse");
  });
});

describe("a chest rolled from a loot table", () => {
  const coinsText = (c: Coins): string => Object.entries(c).map(([k, n]) => `${n} ${k}`).join(", ");
  const ITEM = "11111111-2222-4333-8444-555555555555";
  const payload = {
    loot_table_name: "Smuggler's cache",
    claims_total: 2,
    rolled_atoms: [
      { atom_id: "a1", type: "item", item_id: ITEM, item_name: "Silvered Dagger" },
      { atom_id: "a2", type: "currency", currency_label: "Loose coin", coins: { gp: 30, sp: 0 } },
      { atom_id: "a3", item_id: "srd_potion-of-healing", item_name: "Potion of Healing" },
      { atom_id: "a4", type: "currency", coins: { gp: 0 } },
      { atom_id: "", type: "item", item_id: ITEM, item_name: "No id" },
      { atom_id: "a6", type: "item", item_id: ITEM },
    ],
  };

  // Bug caught: an atom with no type (an older chest) dropped; a library item written to the uuid column; an empty
  // purse or a nameless thing offered as a find.
  it("reads what can really be taken, and tells a campaign item from a library one", () => {
    expect(chestOf(payload)).toEqual({
      picks: 2,
      things: [
        { atomId: "a1", name: "Silvered Dagger", ref: { itemId: ITEM, libraryItemId: null }, coins: null },
        { atomId: "a2", name: "Loose coin", ref: { itemId: null, libraryItemId: null }, coins: { gp: 30 } },
        { atomId: "a3", name: "Potion of Healing", ref: { itemId: null, libraryItemId: "srd_potion-of-healing" }, coins: null },
      ],
    });
  });

  // Bug caught: a chest that gives up nothing (cap 0, or nothing left that can be taken) listed as a find; a cap
  // above what the chest holds letting a thing be asked for that is not there.
  it("is no find when nothing can be taken, and never gives up more than it holds", () => {
    expect(chestOf({ ...payload, claims_total: 0 })).toBeNull();
    expect(chestOf({ claims_total: 3, rolled_atoms: [] })).toBeNull();
    expect(chestOf({ claims_total: 3 })).toBeNull();
    expect(chestOf({ ...payload, claims_total: 9 })?.picks).toBe(3);
  });

  const chest = chestOf(payload)!;

  // Bug caught: a chest that holds more than it gives up emptied whole; a thing taken twice; more taken than the
  // cap; a thing taken that was never in it.
  it("hands over only what was named, within what the chest gives up", () => {
    expect(chestPick(chest, null).ok).toBe(false);
    expect(chestPick(chest, ["a1", "a1"]).ok).toBe(false);
    expect(chestPick(chest, ["a1", "a2", "a3"]).ok).toBe(false);
    expect(chestPick(chest, ["a1", "zz"]).ok).toBe(false);
    expect(chestPick(chest, ["a3", "a2"])).toMatchObject({ ok: true, value: [{ atomId: "a3" }, { atomId: "a2" }] });
  });

  // Bug caught: a chest that gives up all it holds refused until the narrator lists every thing in it.
  it("needs no choosing when the chest gives up everything in it", () => {
    const whole = chestOf({ ...payload, claims_total: 3 })!;
    expect(chestPick(whole, null)).toMatchObject({ ok: true, value: [{ atomId: "a1" }, { atomId: "a2" }, { atomId: "a3" }] });
  });

  // Bug caught: chest_things sent without a chest's placement (an item id, a plain name), or as something that is
  // not a list of ids, taken as an ordinary find.
  it("takes chest_things only with a placement, as a list of ids", () => {
    const P = "11111111-2222-4333-8444-555555555555";
    expect(parseTake({ placement_id: P, chest_things: ["a1"] })).toMatchObject({ ok: true, value: { placementId: P, chestThings: ["a1"] } });
    expect(parseTake({ placement_id: P })).toMatchObject({ ok: true, value: { chestThings: null } });
    expect(parseTake({ name: "A key", chest_things: ["a1"] }).ok).toBe(false);
    expect(parseTake({ placement_id: P, chest_things: [] }).ok).toBe(false);
    expect(parseTake({ placement_id: P, chest_things: "a1" }).ok).toBe(false);
  });

  // Bug caught: a chest listed like a single item, so the narrator cannot say what is in it or name what is taken.
  it("is listed with what it holds, each thing's atom id, and how much it gives up", () => {
    const section = possessionsSection({ carried: [], more: 0, purse: {}, wares: [], loot: [{ id: "p-chest", name: "Smuggler's cache", quantity: 1, ref: { itemId: null, libraryItemId: null }, coins: null, beat: null, chest }] }, coinsText);
    expect(section).toContain("- A chest (Smuggler's cache), opened once, gives up 2 of these, the player's choice (chest_things): Silvered Dagger [atom a1]; 30 gp (Loose coin) [atom a2]; Potion of Healing [atom a3] [placement_id p-chest]");
  });

  it("is told as one opening, in the margin and to the narrator", () => {
    const change = { kind: "chest" as const, placementId: "p", chest: "Smuggler's cache", things: [chest.things[0], chest.things[1]] };
    expect(handsLine(change, "Rosie", coinsText)).toBe("Rosie opens the chest (Smuggler's cache) and takes: Silvered Dagger, 30 gp (Loose coin)");
    // Bug caught: the narrator left believing the rest of the chest can still be taken later.
    expect(handsText(change, coinsText)).toContain("whatever else was in it is gone with the opening");
  });
});
