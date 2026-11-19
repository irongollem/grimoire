// Things change hands at the AI table (#1021).
//
// Until now the narrator could only tell that a key was handed over, a price paid or a body searched: nothing
// moved. Honeycomb's keys stayed in her pockets however the story went, a shop sold nothing, and what lay on a
// defeated creature could not be picked up. These four tools move things for real: from a character's belongings
// to the played character's pack and back, a thing found into the pack, coins in and out of the purse, and a ware
// bought from the shop the party stands in.
//
// The rules they share:
//   1. Nothing is invented by moving it. A thing given must be in the giver's belongings; a thing taken is an item
//      the campaign holds (looked up first) or a plain object with a name and no numbers; coins gained are the
//      narrator's own roll, never a figure it names; a ware bought is one the shop stocks, at the shop's price.
//   2. Coins cannot be overspent: what the purse cannot pay is refused before anything is told.
//   3. Every change is made when the turn is kept, like every other write of a turn, and at most a few a turn.
//
// Pure: no I/O. `handsIo.ts` reads what is carried and stocked, and carries the changes out.

import type { AgentTool } from "./types.ts";
import type { Parsed } from "./parse.ts";
import { isRecord, refuse, UUID_RE } from "./parse.ts";

export const HAND_OVER_TOOL_NAME = "hand_over";
export const TAKE_TOOL_NAME = "take";
export const COINS_TOOL_NAME = "coins";
export const BUY_TOOL_NAME = "buy";
export const HANDS_TOOL_NAMES: ReadonlySet<string> = new Set([HAND_OVER_TOOL_NAME, TAKE_TOOL_NAME, COINS_TOOL_NAME, BUY_TOOL_NAME]);

export const HANDS_PER_TURN = 4;
export const THING_MAX = 80;
export const QUANTITY_MAX = 99;
export const WHY_MAX = 80;

/** The most things one opening of a chest hands over. */
export const CHEST_PICKS_MAX = 12;
const PLAYER = "player";

export const HAND_OVER_TOOL: AgentTool = {
  name: HAND_OVER_TOOL_NAME,
  description:
    "Moves a thing between a character with a record and the player's character: a gift, a loan, a key handed over, " +
    "a thing the player gives away or is made to give up. Exactly one side is the player's character (write " +
    "\"player\"); the other is the character's id. The thing must be among the giver's belongings, named as it is " +
    "there: a character decides for itself what it gives (it says so in its own words or deed), so call this only " +
    "after the giving has happened in the story. It is moved when the turn is kept.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      giver: { type: "string", description: "\"player\", or the id of the character who gives." },
      receiver: { type: "string", description: "\"player\", or the id of the character who receives." },
      thing: { type: "string", maxLength: THING_MAX, description: "The thing's name, as it is among the giver's belongings." },
      quantity: { type: "integer", minimum: 1, maximum: QUANTITY_MAX, description: "How many; 1 when left out." },
    },
    required: ["giver", "receiver", "thing"],
  },
};

export const TAKE_TOOL: AgentTool = {
  name: TAKE_TOOL_NAME,
  description:
    "Puts a thing the player's character picks up into their pack: something found in a room, taken from a chest, " +
    "or searched off a defeated creature. Give item_id for an item the campaign holds (look it up with search " +
    "first; what the campaign has written is used as written). For a plain object with no powers and no price worth " +
    "naming (a shard, a note, a ribbon) give name alone. For something the campaign itself placed here (listed " +
    "under \"Placed within reach\") give its placement_id: that is how a prepared key, book or purse is found, and " +
    "it can be found only once. Never give a name alone for a weapon, armour, a potion or " +
    "anything magical: those must be the campaign's own items. For what is cut from a dead creature (meat, a hide, " +
    "fangs, venom) give from_body with the creature's name as well: once per part, after the player's check. The " +
    "body is put on record as used up for you, so do not record that yourself. Not for a thing a character hands over (hand_over) or a ware from a shop (buy).",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      item_id: { type: "string", description: "The id of the campaign's item, as search or get returned it." },
      name: { type: "string", maxLength: THING_MAX, description: "A plain object's name, when it is not one of the campaign's items." },
      placement_id: { type: "string", description: "The id of something the campaign placed within reach, as listed. Its quantity is the campaign's own." },
      from_body: { type: "string", maxLength: THING_MAX, description: "Only for a part cut from a dead creature: that creature's name, as the story or the fight named it. With item_id or name, never with placement_id." },
      chest_things: {
        type: "array",
        items: { type: "string" },
        maxItems: CHEST_PICKS_MAX,
        description: "Only with the placement_id of a chest that holds more than it gives up: the atom ids of the things the character takes, as listed, at most as many as the chest gives up. A chest is opened once.",
      },
      quantity: { type: "integer", minimum: 1, maximum: QUANTITY_MAX, description: "How many; 1 when left out." },
    },
  },
};

export const COINS_TOOL: AgentTool = {
  name: COINS_TOOL_NAME,
  description:
    "Coins leave or enter the player's character's purse. To pay (a bribe, a toll, a fee, a price agreed in the " +
    "story) give change \"pay\" and the amount; it is refused when the purse cannot cover it, so never tell a " +
    "payment this tool did not take. To gain coins that were found or given, roll the amount with the roll tool " +
    "first and give change \"gain\" with the coin: it takes the total of the roll you made last in this reply, so " +
    "never state an amount gained yourself. For a ware from a shop use buy.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      change: { type: "string", enum: ["pay", "gain"] },
      coin: { type: "string", description: "The coin's key (gp, sp, cp...), as the campaign names its coins." },
      amount: { type: "integer", minimum: 1, description: "How many of that coin are paid. Not given for a gain: the roll decides." },
      why: { type: "string", maxLength: WHY_MAX, description: "What it is for or where it came from, in a few words the player may read." },
    },
    required: ["change", "coin", "why"],
  },
};

export const BUY_TOOL: AgentTool = {
  name: BUY_TOOL_NAME,
  description:
    "The player's character buys a ware from the shop the party stands in, at the shop's own price: the coins leave " +
    "their purse and the ware goes into their pack. Name the ware as \"For sale here\" lists it. Refused when this " +
    "place sells no such thing or the purse cannot pay; then tell the player what it costs and what they have.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      thing: { type: "string", maxLength: THING_MAX, description: "The ware's name, as listed for sale here." },
      quantity: { type: "integer", minimum: 1, maximum: QUANTITY_MAX, description: "How many; 1 when left out." },
    },
    required: ["thing"],
  },
};

/** A coin purse or a price: how many of each coin, by the campaign's own coin keys. */
export type Coins = Record<string, number>;

/** A reference to an item the campaign or the shared library holds; neither for a plain named thing. */
export interface ItemRef {
  itemId: string | null;
  libraryItemId: string | null;
}

export type HandsChange =
  | { kind: "to_player"; from: { id: string; name: string }; thing: string; quantity: number }
  | { kind: "from_player"; to: { id: string; name: string }; thing: string; quantity: number }
  /** `from` is the dead creature a part was cut from (skinning, butchering); absent for anything else picked up. */
  | { kind: "take"; thing: string; quantity: number; ref: ItemRef; from?: string }
  /** Something the campaign placed within reach (a room's or a quest beat's loot) is found: an item, or coins. */
  | { kind: "loot"; placementId: string; thing: string; quantity: number; ref: ItemRef; coins: Coins | null }
  /** A chest the campaign rolled from a loot table is opened, once: what the character takes out of it. */
  | { kind: "chest"; placementId: string; chest: string; things: ChestThing[] }
  | { kind: "pay"; coins: Coins; why: string }
  | { kind: "gain"; coins: Coins; why: string }
  | { kind: "buy"; thing: string; quantity: number; ref: ItemRef; price: Coins };


function quantityOf(raw: unknown): number | null {
  if (raw === undefined) return 1;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= QUANTITY_MAX ? raw : null;
}

function thingOf(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() !== "" && raw.trim().length <= THING_MAX ? raw.trim() : null;
}

/** Who gives what to whom, before anything is looked up. Exactly one side is the played character. */
export function parseHandOver(input: Record<string, unknown>): Parsed<{ direction: "to_player" | "from_player"; characterId: string; thing: string; quantity: number }> {
  const { giver, receiver } = input;
  const thing = thingOf(input.thing);
  const quantity = quantityOf(input.quantity);
  if (thing === null) return refuse("thing is required: the thing's name as it is among the giver's belongings.");
  if (quantity === null) return refuse(`quantity is a whole number from 1 to ${QUANTITY_MAX}.`);
  if (giver === PLAYER && receiver === PLAYER) return refuse("The player's character cannot hand a thing to themselves.");
  if (giver === PLAYER) {
    if (typeof receiver !== "string" || !UUID_RE.test(receiver)) return refuse("receiver must be the id of the character who receives it.");
    return { ok: true, value: { direction: "from_player", characterId: receiver, thing, quantity } };
  }
  if (receiver === PLAYER) {
    if (typeof giver !== "string" || !UUID_RE.test(giver)) return refuse("giver must be the id of the character who gives it.");
    return { ok: true, value: { direction: "to_player", characterId: giver, thing, quantity } };
  }
  return refuse("One side must be \"player\": this tool moves things to or from the player's character. What two other characters give each other is a fact for record.");
}

/** What is picked up, before the item is looked up: one of the campaign's items by id, or a plain named object. */
export function parseTake(
  input: Record<string, unknown>,
): Parsed<{ itemId: string | null; name: string | null; placementId: string | null; quantity: number; chestThings: string[] | null; fromBody: string | null }> {
  let fromBody: string | null = null;
  if (input.from_body !== undefined) {
    fromBody = thingOf(input.from_body);
    if (fromBody === null) return refuse(`from_body is the dead creature's name, at most ${THING_MAX} characters.`);
    if (input.placement_id !== undefined) return refuse("from_body is for a part cut from a body: give it with item_id or name, not with placement_id.");
  }
  let chestThings: string[] | null = null;
  if (input.chest_things !== undefined) {
    const raw = input.chest_things;
    if (input.placement_id === undefined) return refuse("chest_things goes with the placement_id of a chest.");
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > CHEST_PICKS_MAX || !raw.every((id): id is string => typeof id === "string" && id.trim() !== "")) {
      return refuse(`chest_things is a list of 1 to ${CHEST_PICKS_MAX} atom ids, as the chest lists them.`);
    }
    chestThings = raw;
  }
  const quantity = quantityOf(input.quantity);
  if (quantity === null) return refuse(`quantity is a whole number from 1 to ${QUANTITY_MAX}.`);
  const hasId = input.item_id !== undefined;
  const hasName = input.name !== undefined;
  const hasPlacement = input.placement_id !== undefined;
  if ([hasId, hasName, hasPlacement].filter(Boolean).length !== 1) {
    return refuse("Give exactly one: placement_id for something the campaign placed here, item_id for one of the campaign's items, or name alone for a plain object.");
  }
  if (hasPlacement) {
    if (typeof input.placement_id !== "string" || !UUID_RE.test(input.placement_id)) return refuse("placement_id must be an id listed under \"Placed within reach\".");
    return { ok: true, value: { itemId: null, name: null, placementId: input.placement_id, quantity, chestThings, fromBody: null } };
  }
  if (hasId) {
    if (typeof input.item_id !== "string" || !UUID_RE.test(input.item_id)) return refuse("item_id must be the item's id, as search or get returned it.");
    return { ok: true, value: { itemId: input.item_id, name: null, placementId: null, quantity, chestThings: null, fromBody } };
  }
  const name = thingOf(input.name);
  if (name === null) return refuse(`name is the plain object's name, at most ${THING_MAX} characters.`);
  return { ok: true, value: { itemId: null, name, placementId: null, quantity, chestThings: null, fromBody } };
}

/** One thing in a rolled chest: an item, or coins. */
export interface ChestThing {
  atomId: string;
  name: string;
  ref: ItemRef;
  /** Set for coins; null for an item. */
  coins: Coins | null;
}

/** A chest as it was rolled when the campaign prepared it: what lies in it and how many things it gives up. */
export interface Chest {
  picks: number;
  things: ChestThing[];
}

/**
 * A prepared chest read from its placement's payload (`rolled_atoms`, `claims_total`): rolled when the Dungeon
 * Master prepared it, so the table never rolls it again. Null when nothing can be taken from it. An atom with no
 * type is an item (older chests); an item id that is not a uuid names a shared library item.
 */
export function chestOf(payload: unknown): Chest | null {
  if (!isRecord(payload) || !Array.isArray(payload.rolled_atoms)) return null;
  const things = payload.rolled_atoms.flatMap((atom: unknown): ChestThing[] => {
    if (!isRecord(atom) || typeof atom.atom_id !== "string" || atom.atom_id === "") return [];
    if (atom.type === "currency") {
      const coins: Coins = {};
      if (isRecord(atom.coins)) for (const [key, n] of Object.entries(atom.coins)) if (typeof n === "number" && Number.isInteger(n) && n > 0) coins[key] = n;
      if (Object.keys(coins).length === 0) return [];
      return [{ atomId: atom.atom_id, name: typeof atom.currency_label === "string" ? atom.currency_label.trim() : "", ref: { itemId: null, libraryItemId: null }, coins }];
    }
    if (typeof atom.item_id !== "string" || typeof atom.item_name !== "string" || atom.item_name.trim() === "") return [];
    const own = UUID_RE.test(atom.item_id);
    return [{ atomId: atom.atom_id, name: atom.item_name.trim(), ref: { itemId: own ? atom.item_id : null, libraryItemId: own ? null : atom.item_id }, coins: null }];
  });
  const total = payload.claims_total;
  const picks = typeof total === "number" && Number.isInteger(total) ? Math.min(total, things.length, CHEST_PICKS_MAX) : 0;
  return picks < 1 ? null : { picks, things };
}

/**
 * What one opening of a chest hands over. A chest that gives up everything in it needs no choosing; one that holds
 * more than it gives up needs the things named, each once, and no more of them than it gives up.
 */
export function chestPick(chest: Chest, wanted: readonly string[] | null): Parsed<ChestThing[]> {
  if (wanted === null) {
    if (chest.things.length <= chest.picks) return { ok: true, value: chest.things };
    return refuse(`This chest holds ${chest.things.length} things and gives up ${chest.picks}: ask the player which they take, then give those atom ids as chest_things.`);
  }
  if (new Set(wanted).size !== wanted.length) return refuse("chest_things names a thing twice.");
  if (wanted.length > chest.picks) return refuse(`This chest gives up ${chest.picks} ${chest.picks === 1 ? "thing" : "things"}, not ${wanted.length}.`);
  const things: ChestThing[] = [];
  for (const id of wanted) {
    const thing = chest.things.find((t) => t.atomId === id);
    if (thing === undefined) return refuse(`No thing with the atom id ${id} is in this chest.`);
    things.push(thing);
  }
  return { ok: true, value: things };
}

/** What a purse is worth in the smallest coin; a coin the campaign does not name is worth nothing. */
export function worth(coins: Coins, coinValues: ReadonlyMap<string, number>): number {
  let total = 0;
  for (const [key, count] of Object.entries(coins)) total += (coinValues.get(key) ?? 0) * count;
  return total;
}

/**
 * Coins in or out of the purse. A payment names its amount and must be covered; a gain takes the narrator's last
 * roll and nothing else.
 */
export function parseCoins(
  input: Record<string, unknown>,
  ctx: { coinValues: ReadonlyMap<string, number>; purse: Coins; lastRoll: number | null },
): Parsed<HandsChange & { kind: "pay" | "gain" }> {
  const { change, coin, amount, why } = input;
  if (change !== "pay" && change !== "gain") return refuse("change must be \"pay\" or \"gain\".");
  if (typeof coin !== "string" || !ctx.coinValues.has(coin)) return refuse(`coin must be one of this campaign's coins: ${[...ctx.coinValues.keys()].join(", ")}.`);
  if (typeof why !== "string" || why.trim() === "" || why.trim().length > WHY_MAX) return refuse(`why is required: a few words, at most ${WHY_MAX} characters.`);
  if (change === "gain") {
    if (ctx.lastRoll === null) return refuse("Roll the amount first with the roll tool, then call this again: a gain takes that roll's total. Never state an amount yourself.");
    if (ctx.lastRoll < 1) return refuse("The roll came to nothing, so there is nothing to gain. Tell that.");
    return { ok: true, value: { kind: "gain", coins: { [coin]: ctx.lastRoll }, why: why.trim() } };
  }
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1) return refuse("amount is how many of that coin are paid: a whole number of 1 or more.");
  const cost: Coins = { [coin]: amount };
  if (worth(cost, ctx.coinValues) > worth(ctx.purse, ctx.coinValues)) {
    return refuse("The player's character cannot pay that: their purse does not hold it (see \"What the player's character carries\"). Tell them so; nothing is paid.");
  }
  return { ok: true, value: { kind: "pay", coins: cost, why: why.trim() } };
}

/** A ware of the shop the party stands in: its name, its reference and its price in coins (null when it has none that can be read). */
export interface Ware {
  name: string;
  ref: ItemRef;
  price: Coins | null;
  priceText: string | null;
}

const same = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A purchase: the ware must be stocked here and the purse must cover the price for as many as are bought. */
export function parseBuy(
  input: Record<string, unknown>,
  ctx: { wares: readonly Ware[]; coinValues: ReadonlyMap<string, number>; purse: Coins },
): Parsed<HandsChange & { kind: "buy" }> {
  const thing = thingOf(input.thing);
  const quantity = quantityOf(input.quantity);
  if (thing === null) return refuse("thing is required: the ware's name, as listed for sale here.");
  if (quantity === null) return refuse(`quantity is a whole number from 1 to ${QUANTITY_MAX}.`);
  if (ctx.wares.length === 0) return refuse("Nothing is for sale in this place. A price agreed with someone in the story is paid with coins, and the thing handed over with hand_over.");
  const ware = ctx.wares.find((w) => same(w.name, thing));
  if (!ware) return refuse(`That is not for sale here. For sale: ${ctx.wares.map((w) => w.name).join(", ")}.`);
  if (ware.price === null) return refuse(`${ware.name} has no price that can be read${ware.priceText ? ` ("${ware.priceText}")` : ""}. Agree a price in the story, take it with coins, and hand the thing over with take.`);
  const price: Coins = {};
  for (const [key, count] of Object.entries(ware.price)) price[key] = count * quantity;
  if (worth(price, ctx.coinValues) > worth(ctx.purse, ctx.coinValues)) {
    return refuse(`The player's character cannot pay for that: ${quantity > 1 ? `${quantity} of ` : ""}${ware.name} costs more than their purse holds. Tell them the price and what they have; nothing is bought.`);
  }
  return { ok: true, value: { kind: "buy", thing: ware.name, quantity, ref: ware.ref, price } };
}

/**
 * The purse after a payment. Paid from the coins named when the purse holds them; otherwise the whole purse is
 * counted out again from its worth, the way a shopkeeper gives change. `change` turns a worth into coins.
 */
export function purseAfterPaying(purse: Coins, cost: Coins, coinValues: ReadonlyMap<string, number>, change: (value: number) => Coins): Coins | null {
  const left = worth(purse, coinValues) - worth(cost, coinValues);
  if (left < 0) return null;
  const exact = Object.entries(cost).every(([key, count]) => (purse[key] ?? 0) >= count);
  if (!exact) return change(left);
  const out: Coins = { ...purse };
  for (const [key, count] of Object.entries(cost)) {
    const remaining = (out[key] ?? 0) - count;
    if (remaining > 0) out[key] = remaining;
    else delete out[key];
  }
  return out;
}

/** The purse with coins added. */
export function purseAfterGaining(purse: Coins, gain: Coins): Coins {
  const out: Coins = { ...purse };
  for (const [key, count] of Object.entries(gain)) out[key] = (out[key] ?? 0) + count;
  return out;
}

const count = (quantity: number): string => (quantity > 1 ? `${quantity} × ` : "");

/** The change as the page writes it in the story's margin. `who` is the played character; `coins` words a purse. */
export function handsLine(change: HandsChange, who: string, coins: (c: Coins) => string): string {
  switch (change.kind) {
    case "to_player":
      return `${change.from.name} gives ${who}: ${count(change.quantity)}${change.thing}`;
    case "from_player":
      return `${who} gives ${change.to.name}: ${count(change.quantity)}${change.thing}`;
    case "take":
      return change.from === undefined ? `${who} takes: ${count(change.quantity)}${change.thing}` : `${who} takes from the body of ${change.from}: ${count(change.quantity)}${change.thing}`;
    case "loot":
      return change.coins !== null ? `${who} finds ${coins(change.coins)}: ${change.thing}` : `${who} finds: ${count(change.quantity)}${change.thing}`;
    case "chest":
      return `${who} opens ${chestName(change.chest)} and takes: ${chestWords(change.things, coins)}`;
    case "pay":
      return `${who} pays ${coins(change.coins)}: ${change.why}`;
    case "gain":
      return `${who} gains ${coins(change.coins)}: ${change.why}`;
    case "buy":
      return `${who} buys ${count(change.quantity)}${change.thing} for ${coins(change.price)}`;
  }
}

const chestName = (name: string): string => (name === "" ? "the chest" : `the chest (${name})`);
const chestWords = (things: readonly ChestThing[], coins: (c: Coins) => string): string =>
  things.map((t) => (t.coins !== null ? `${coins(t.coins)}${t.name === "" ? "" : ` (${t.name})`}` : t.name)).join(", ");

/** What the narrator is told once a change is taken. */
export function handsText(change: HandsChange, coins: (c: Coins) => string): string {
  const what =
    change.kind === "pay" ? `${coins(change.coins)} leave the purse`
    : change.kind === "gain" ? `${coins(change.coins)} enter the purse`
    : change.kind === "buy" ? `${count(change.quantity)}${change.thing} is bought for ${coins(change.price)}`
    : change.kind === "chest" ? `${chestName(change.chest)} is opened and gives up ${chestWords(change.things, coins)}; whatever else was in it is gone with the opening`
    : change.kind === "loot" && change.coins !== null ? `${coins(change.coins)} (${change.thing}) enter the purse`
    : `${count(change.quantity)}${change.thing} changes hands`;
  return `When this turn is kept: ${what}. Tell it once, in a sentence, as part of the story.`;
}

/** What the played character has on them, for the narrator: the pack by name and count, and the purse. */
export interface Possessions {
  carried: { name: string; quantity: number }[];
  /** More things than are listed. */
  more: number;
  purse: Coins;
  wares: Ware[];
  /** What the campaign placed within the party's reach and nobody has taken yet: the loot of this place and of the quest beats in play. */
  loot: Loot[];
}

/** One prepared thing to be found: an item with its count, or coins. */
export interface Loot {
  id: string;
  name: string;
  quantity: number;
  ref: ItemRef;
  /** Set for a purse of coins; null for an item. */
  coins: Coins | null;
  /** The quest beat it was placed on, by its title; null when it was placed on the place itself. */
  beat: string | null;
  /** Set for the loot of a fight that is over: on the bodies of the fallen, or still on those who gave in. */
  held?: { by: "fallen" | "yielded"; fight: string };
  /** Set for a chest rolled from a loot table (`name` is then the table's name): what is in it. */
  chest?: Chest;
}

export const MAX_LOOT_SHOWN = 20;

export const MAX_CARRIED_SHOWN = 40;
export const MAX_WARES_SHOWN = 30;

/** The section of the turn's state that says what the played character carries and what this place sells. */
export function possessionsSection(p: Possessions | null, coins: (c: Coins) => string): string {
  if (p === null) return "";
  const lines = ["## What the player's character carries"];
  const purse = coins(p.purse);
  lines.push(`Purse: ${purse === "" ? "empty" : purse}.`);
  if (p.carried.length === 0) lines.push("Nothing else on record.");
  else {
    lines.push(p.carried.slice(0, MAX_CARRIED_SHOWN).map((c) => (c.quantity > 1 ? `${c.name} (${c.quantity})` : c.name)).join("; ") + ".");
    const hidden = p.more + Math.max(0, p.carried.length - MAX_CARRIED_SHOWN);
    if (hidden > 0) lines.push(`And ${hidden} more things.`);
  }
  lines.push("They have nothing else: a thing they say they use, show or give must be here.");
  if (p.wares.length > 0) {
    lines.push("", "## For sale here");
    for (const w of p.wares.slice(0, MAX_WARES_SHOWN)) {
      lines.push(`- ${w.name}: ${w.price !== null ? coins(w.price) : w.priceText !== null ? `${w.priceText} (not a price in coins)` : "no price set"}`);
    }
    if (p.wares.length > MAX_WARES_SHOWN) lines.push(`- and ${p.wares.length - MAX_WARES_SHOWN} more wares`);
  }
  if (p.loot.length > 0) {
    lines.push(
      "",
      "## Placed within reach",
      "The campaign put these here to be found: in this place, or at the point of the story the party has reached. They are found when the story finds them (a search, a chest opened, a body gone through, a thing handed over at the right moment), not before, and each only once. Give one with take and its placement_id.",
    );
    for (const l of p.loot.slice(0, MAX_LOOT_SHOWN)) {
      if (l.chest !== undefined) {
        const inside = l.chest.things.map((t) => `${t.coins !== null ? `${coins(t.coins)}${t.name === "" ? "" : ` (${t.name})`}` : t.name} [atom ${t.atomId}]`).join("; ");
        const rule = l.chest.things.length <= l.chest.picks ? "gives up all of it" : `gives up ${l.chest.picks} of these, the player's choice (chest_things)`;
        lines.push(`- A chest${l.name === "" ? "" : ` (${l.name})`}${l.beat === null ? "" : `, at "${l.beat}"`}, opened once, ${rule}: ${inside} [placement_id ${l.id}]`);
        continue;
      }
      const what = l.coins !== null ? `${coins(l.coins)}${l.name === "" ? "" : ` (${l.name})`}` : `${l.quantity > 1 ? `${l.quantity} × ` : ""}${l.name}`;
      const of = l.held === undefined || l.held.fight === "" ? "" : ` of "${l.held.fight}"`;
      const held = l.held === undefined ? ""
        : l.held.by === "fallen" ? `, on the fallen${of}: found by going through the bodies`
        : `, still carried by those${of} who gave in: theirs until they hand it over or are searched`;
      lines.push(`- ${what}${l.beat === null ? "" : `, at "${l.beat}"`}${held} [placement_id ${l.id}]`);
    }
    if (p.loot.length > MAX_LOOT_SHOWN) lines.push(`- and ${p.loot.length - MAX_LOOT_SHOWN} more`);
  }
  return lines.join("\n");
}

/**
 * What was cut from dead creatures in one reply, as sentences for the record, one per body. A body that has been
 * skinned or butchered is used up: the record is how the narrator knows not to give its parts a second time.
 * App convention: 5e has no harvesting rule, so what a body yields and the check for it are the Dungeon Master's call.
 */
export function harvestFacts(changes: readonly HandsChange[], who: string): string[] {
  const byBody = new Map<string, string[]>();
  for (const change of changes) {
    if (change.kind !== "take" || change.from === undefined) continue;
    const parts = byBody.get(change.from);
    const part = `${count(change.quantity)}${change.thing}`;
    if (parts === undefined) byBody.set(change.from, [part]);
    else parts.push(part);
  }
  return [...byBody].map(([body, parts]) => `${who} took ${parts.join(", ")} from the body of ${body}. The body is used up: nothing more can be taken from it.`);
}
