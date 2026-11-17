// What is carried and stocked, and the changes of hands carried out (`_shared/agent/hands.ts`).
//
// Everything here is read and written with the service role, after the handler has checked the caller runs this
// campaign's table. So every query carries the campaign itself: an id the model supplies from another campaign is
// simply not found. Under the service role the database's own same-campaign checks on `party_inventory` and
// `npc_inventory` do not run (they key on `auth.uid()`), which is why nothing is written here from an id that was
// not first read back in this campaign.

import type { SupabaseClient } from "@supabase/supabase-js";
import { coinValue, formatCoins, loadCampaignCurrency, makeChange, parsePrice, type CurrencyConfig } from "../_shared/currency.ts";
import {
  MAX_CARRIED_SHOWN,
  purseAfterGaining,
  purseAfterPaying,
  type Coins,
  type HandsChange,
  type ItemRef,
  type Possessions,
  type Ware,
} from "../_shared/agent/hands.ts";

/** A thing in someone's keeping, as a row to move. */
export interface Held {
  rowId: string;
  name: string;
  quantity: number;
  ref: ItemRef;
}

/** The lookups a turn's tools make before they take a change, and how the changes are made once the turn is kept. */
export interface HandsStore {
  /** What the played character carries and what the place sells, with the campaign's coins. Throws when it cannot be read. */
  load(campaignId: string, memberId: string, placeId: string | null): Promise<{ possessions: Possessions; currency: CurrencyConfig }>;
  /** A thing among a character's belongings, by name; null when they do not have it (or are not of this campaign). */
  belonging(campaignId: string, characterId: string, thing: string): Promise<(Held & { owner: string }) | null>;
  /** The name of a character of this campaign as the party knows them; null when there is none. */
  characterName(campaignId: string, characterId: string): Promise<string | null>;
  /** A thing the played character carries, by name. */
  carried(campaignId: string, memberId: string, thing: string): Promise<Held | null>;
  /** One of the campaign's own items, by id. */
  item(campaignId: string, itemId: string): Promise<{ name: string } | null>;
  /** Makes the change. Throws when it cannot be made; the caller keeps the turn either way. */
  apply(ctx: { campaignId: string; userId: string; memberId: string }, change: HandsChange): Promise<void>;
}

const refOf = (row: { item_id: unknown; library_item_id: unknown }): ItemRef => ({
  itemId: typeof row.item_id === "string" ? row.item_id : null,
  libraryItemId: typeof row.library_item_id === "string" ? row.library_item_id : null,
});

/** A name as an exact, case-blind match: the wildcards a model might type are taken as letters. */
const exactly = (name: string): string => name.replace(/[%_\\]/g, "\\$&");

function asCoins(raw: unknown): Coins {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Coins = {};
  for (const [key, count] of Object.entries(raw)) if (typeof count === "number" && Number.isInteger(count) && count > 0) out[key] = count;
  return out;
}

export function coinValuesOf(currency: CurrencyConfig): Map<string, number> {
  return new Map(currency.denominations.map((d) => [d.key, d.value]));
}

export function makeHandsStore(admin: SupabaseClient): HandsStore {
  async function purseOf(campaignId: string, memberId: string): Promise<Coins> {
    const { data, error } = await admin.from("party_members").select("coins").eq("id", memberId).eq("campaign_id", campaignId).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("the played character is not of this campaign");
    return asCoins(data.coins);
  }

  async function intoPack(ctx: { campaignId: string; userId: string; memberId: string }, thing: { name: string; quantity: number; ref: ItemRef }): Promise<void> {
    const { error } = await admin.from("party_inventory").insert({
      campaign_id: ctx.campaignId,
      user_id: ctx.userId,
      item_id: thing.ref.itemId,
      library_item_id: thing.ref.libraryItemId,
      name: thing.name,
      quantity: thing.quantity,
      carried_by: ctx.memberId,
      location: "backpack",
    });
    if (error) throw error;
  }

  /** Takes `quantity` off a row, removing it when none is left. */
  async function takeFrom(table: "npc_inventory" | "party_inventory", campaignId: string, held: Held, quantity: number): Promise<void> {
    const left = held.quantity - quantity;
    const write = left > 0
      ? await admin.from(table).update({ quantity: left }).eq("id", held.rowId).eq("campaign_id", campaignId)
      : await admin.from(table).delete().eq("id", held.rowId).eq("campaign_id", campaignId);
    if (write.error) throw write.error;
  }

  const store: HandsStore = {
    async load(campaignId, memberId, placeId) {
      // The coins first: a ware's price is read in them.
      const currency = await loadCampaignCurrency(admin, campaignId);
      const [purse, pack, wares] = await Promise.all([
        purseOf(campaignId, memberId),
        admin.from("party_inventory").select("name, quantity", { count: "exact" }).eq("campaign_id", campaignId).eq("carried_by", memberId).gt("quantity", 0).order("name").limit(MAX_CARRIED_SHOWN),
        placeId === null ? Promise.resolve([] as Ware[]) : waresAt(admin, campaignId, placeId, currency),
      ]);
      if (pack.error) throw pack.error;
      const carried = (pack.data ?? []).map((r) => ({ name: r.name as string, quantity: r.quantity as number }));
      return { possessions: { carried, more: Math.max(0, (pack.count ?? carried.length) - carried.length), purse, wares }, currency };
    },

    async belonging(campaignId, characterId, thing) {
      const [owner, row] = await Promise.all([
        store.characterName(campaignId, characterId),
        admin.from("npc_inventory").select("id, name, quantity, item_id, library_item_id").eq("npc_id", characterId).eq("campaign_id", campaignId).ilike("name", exactly(thing)).gt("quantity", 0).limit(1).maybeSingle(),
      ]);
      if (row.error) throw row.error;
      if (owner === null || !row.data) return null;
      return { rowId: row.data.id as string, name: row.data.name as string, quantity: row.data.quantity as number, ref: refOf(row.data), owner };
    },

    async characterName(campaignId, characterId) {
      const { data, error } = await admin.from("npcs").select("name, disguise_name, is_revealed").eq("id", characterId).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      // A character still in disguise is named by the disguise: the line goes on the player's page.
      return typeof data.disguise_name === "string" && data.disguise_name !== "" && data.is_revealed !== true ? data.disguise_name : (data.name as string);
    },

    async carried(campaignId, memberId, thing) {
      const { data, error } = await admin.from("party_inventory").select("id, name, quantity, item_id, library_item_id").eq("carried_by", memberId).eq("campaign_id", campaignId).ilike("name", exactly(thing)).gt("quantity", 0).limit(1).maybeSingle();
      if (error) throw error;
      return data ? { rowId: data.id as string, name: data.name as string, quantity: data.quantity as number, ref: refOf(data) } : null;
    },

    async item(campaignId, itemId) {
      const { data, error } = await admin.from("items").select("name").eq("id", itemId).eq("campaign_id", campaignId).maybeSingle();
      if (error) throw error;
      return data ? { name: data.name as string } : null;
    },

    async apply(ctx, change) {
      const { campaignId, memberId } = ctx;
      switch (change.kind) {
        case "to_player": {
          const held = await store.belonging(campaignId, change.from.id, change.thing);
          if (held === null) throw new Error("the giver no longer has the thing");
          const quantity = Math.min(change.quantity, held.quantity);
          // Into the pack first, out of the giver's pockets second: a failure between the two loses nothing.
          await intoPack(ctx, { name: held.name, quantity, ref: held.ref });
          await takeFrom("npc_inventory", campaignId, held, quantity);
          return;
        }
        case "from_player": {
          const held = await store.carried(campaignId, memberId, change.thing);
          if (held === null) throw new Error("the played character no longer has the thing");
          const quantity = Math.min(change.quantity, held.quantity);
          // One row per item for a character: a second of the same item joins the first.
          const twin = held.ref.itemId === null
            ? null
            : await admin.from("npc_inventory").select("id, quantity").eq("npc_id", change.to.id).eq("campaign_id", campaignId).eq("item_id", held.ref.itemId).maybeSingle();
          if (twin?.error) throw twin.error;
          const write = twin?.data
            ? await admin.from("npc_inventory").update({ quantity: (twin.data.quantity as number) + quantity }).eq("id", twin.data.id as string).eq("campaign_id", campaignId)
            : await admin.from("npc_inventory").insert({ campaign_id: campaignId, user_id: ctx.userId, npc_id: change.to.id, item_id: held.ref.itemId, library_item_id: held.ref.libraryItemId, name: held.name, quantity });
          if (write.error) throw write.error;
          await takeFrom("party_inventory", campaignId, held, quantity);
          return;
        }
        case "take":
          await intoPack(ctx, { name: change.thing, quantity: change.quantity, ref: change.ref });
          return;
        case "pay":
        case "gain":
        case "buy": {
          const currency = await loadCampaignCurrency(admin, campaignId);
          const purse = await purseOf(campaignId, memberId);
          const next = change.kind === "gain"
            ? purseAfterGaining(purse, change.coins)
            : purseAfterPaying(purse, change.kind === "buy" ? change.price : change.coins, coinValuesOf(currency), (value) => makeChange(value, currency));
          // The purse may have changed since the tool looked: what it can no longer pay is not paid, and not bought.
          if (next === null) throw new Error("the purse no longer covers it");
          const { error } = await admin.from("party_members").update({ coins: next }).eq("id", memberId).eq("campaign_id", campaignId);
          if (error) throw error;
          if (change.kind === "buy") await intoPack(ctx, { name: change.thing, quantity: change.quantity, ref: change.ref });
          return;
        }
      }
    },
  };
  return store;
}

/** What a place sells, when it is a place of this campaign with wares on show: each with the shop's own price. */
async function waresAt(admin: SupabaseClient, campaignId: string, placeId: string, currency: CurrencyConfig): Promise<Ware[]> {
  const place = await admin.from("locations").select("id").eq("id", placeId).eq("campaign_id", campaignId).maybeSingle();
  if (place.error) throw place.error;
  if (!place.data) return [];
  const stock = await admin.from("store_items").select("item_id, library_item_id, price_override, sort_order").eq("location_id", placeId).eq("visible", true).order("sort_order").limit(60);
  if (stock.error) throw stock.error;
  const rows = stock.data ?? [];
  const ids = rows.flatMap((r) => (typeof r.item_id === "string" ? [r.item_id] : []));
  const libraryIds = rows.flatMap((r) => (typeof r.library_item_id === "string" ? [r.library_item_id] : []));
  const [own, shared] = await Promise.all([
    ids.length === 0 ? Promise.resolve({ data: [], error: null }) : admin.from("items").select("id, name, cost").in("id", ids),
    libraryIds.length === 0 ? Promise.resolve({ data: [], error: null }) : admin.from("library_items").select("id, name, cost").in("id", libraryIds),
  ]);
  if (own.error) throw own.error;
  if (shared.error) throw shared.error;
  const known = new Map<string, { name: string; cost: string | null }>();
  for (const i of [...(own.data ?? []), ...(shared.data ?? [])]) known.set(i.id as string, { name: i.name as string, cost: (i.cost as string | null) ?? null });
  return rows.flatMap((r): Ware[] => {
    const ref = refOf(r);
    const key = ref.itemId ?? ref.libraryItemId;
    const item = key === null ? undefined : known.get(key);
    if (!item) return [];
    const override = typeof r.price_override === "string" && r.price_override.trim() !== "" ? r.price_override : null;
    const priceText = override ?? item.cost;
    const price = priceText === null ? null : parsePrice(priceText, currency);
    return [{ name: item.name, ref, price: price !== null && coinValue(price, currency) > 0 ? price : null, priceText }];
  });
}

/** A purse or a price in words, in the campaign's coins. */
export const coinsText = (currency: CurrencyConfig) => (coins: Coins): string => formatCoins(coins, currency);
