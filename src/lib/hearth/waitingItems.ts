import { formatCoins, type Coins, type CurrencyConfig } from "@/lib/currency/currency";
import type {
  CampaignMessage,
  CurrencyDropMetadata,
  ItemDropMetadata,
  LootChestMetadata,
  PlayerOfferMetadata,
  VendorOfferMetadata,
} from "@/types/chat.types";

export interface WaitingItem {
  messageId: string;
  kind: "item" | "coins" | "chest" | "offer" | "vendor";
  title: string;
  /** Secondary line; null when there is nothing to add. */
  detail: string | null;
}

function priceText(coins: Coins, currency: CurrencyConfig): string | null {
  return formatCoins(coins, currency) || null;
}

function withQuantity(name: string, quantity: number): string {
  return quantity > 1 ? `${quantity}× ${name}` : name;
}

function describe(m: CampaignMessage, currency: CurrencyConfig): Omit<WaitingItem, "messageId"> | null {
  switch (m.type) {
    case "item_drop": {
      const d = m.metadata as ItemDropMetadata | null;
      if (!d) return null;
      const left = d.quantity_remaining ?? d.quantity;
      if (d.claimed_by_user_id !== null || left <= 0) return null;
      return { kind: "item", title: withQuantity(d.item_name, left), detail: d.item_rarity };
    }
    case "currency_drop": {
      const d = m.metadata as CurrencyDropMetadata | null;
      if (!d || d.claimed_by_user_id !== null) return null;
      return { kind: "coins", title: d.label ?? "Coins", detail: priceText(d.coins, currency) };
    }
    case "loot_chest": {
      const d = m.metadata as LootChestMetadata | null;
      if (!d) return null;
      const left = d.claims_total - d.claims.length;
      if (left <= 0) return null;
      return { kind: "chest", title: d.loot_table_name, detail: `${left} of ${d.claims_total} left` };
    }
    case "player_offer": {
      const d = m.metadata as PlayerOfferMetadata | null;
      if (!d || d.sold_to_user_id !== null) return null;
      return { kind: "offer", title: withQuantity(d.item_name, d.quantity), detail: priceText(d.price, currency) };
    }
    case "vendor_offer": {
      const d = m.metadata as VendorOfferMetadata | null;
      if (!d || d.paid_by_user_id !== null) return null;
      return { kind: "vendor", title: d.item_name ?? d.description, detail: priceText(d.price, currency) };
    }
    default:
      return null;
  }
}

/**
 * Things on the table that are still up for grabs: loot, coins, chests and
 * offers posted at or after `sinceIso` by someone other than me, and not yet
 * claimed, bought or emptied. Newest first. A private whisper to someone else
 * is never shown.
 */
export function openTableItems(
  messages: readonly CampaignMessage[],
  myUserId: string | null | undefined,
  sinceIso: string,
  currency: CurrencyConfig,
): WaitingItem[] {
  const since = Date.parse(sinceIso);
  return messages
    .filter((m) => m.user_id !== myUserId)
    .filter((m) => m.recipient_user_id === null || m.recipient_user_id === myUserId)
    .filter((m) => Date.parse(m.created_at) >= since)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .flatMap((m) => {
      const d = describe(m, currency);
      return d ? [{ messageId: m.id, ...d }] : [];
    });
}
