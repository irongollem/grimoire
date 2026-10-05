import { describe, expect, it } from "vitest";
import type { CampaignMessage } from "@/types/chat.types";
import { openTableItems } from "./waitingItems";

function msg(o: Partial<CampaignMessage> & Pick<CampaignMessage, "id" | "type">): CampaignMessage {
  return {
    campaign_id: "c",
    user_id: "dm",
    recipient_user_id: null,
    sender_name: "DM",
    message: "",
    metadata: null,
    created_at: "2026-10-05T12:00:00Z",
    ...o,
  };
}
const coin = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
const SINCE = "2026-10-05T10:00:00Z";

describe("openTableItems", () => {
  it("lists open items, newest first, with readable titles", () => {
    const out = openTableItems(
      [
        msg({
          id: "item",
          type: "item_drop",
          created_at: "2026-10-05T11:00:00Z",
          metadata: { item_id: null, item_name: "Potion of Healing", item_rarity: "common", quantity: 3, quantity_remaining: 2, claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null },
        }),
        msg({
          id: "chest",
          type: "loot_chest",
          created_at: "2026-10-05T13:00:00Z",
          metadata: { loot_table_id: null, loot_table_name: "Goblin Hoard", chest_image_url: null, rolled_atoms: [], claims: [{ atom_id: "a", claimed_by_user_id: "u", claimed_by_name: "n", claimed_at: "" }, { atom_id: "b", claimed_by_user_id: "u", claimed_by_name: "n", claimed_at: "" }], claims_total: 4 },
        }),
        msg({
          id: "coins",
          type: "currency_drop",
          created_at: "2026-10-05T12:30:00Z",
          metadata: { label: null, ...coin, gp: 5, sp: 3, claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null },
        }),
      ],
      "me",
      SINCE,
    );
    expect(out.map((i) => i.messageId)).toEqual(["chest", "coins", "item"]);
    expect(out[0]).toMatchObject({ kind: "chest", title: "Goblin Hoard", detail: "2 of 4 left" });
    expect(out[1]).toMatchObject({ kind: "coins", title: "Coins", detail: "5 GP 3 SP" });
    expect(out[2]).toMatchObject({ kind: "item", title: "2× Potion of Healing" });
  });

  it("drops claimed, emptied, sold, paid, mine, old and whispered-to-others", () => {
    const claimedItem = { item_id: null, item_name: "X", item_rarity: null, quantity: 1, claimed_by_user_id: "u", claimed_by_name: "n", claimed_party_member_id: null };
    const offer = { item_name: "Sword", item_id: null, inventory_item_id: "i", quantity: 1, ...coin, gp: 10, seller_party_member_id: "s", sold_to_user_id: null, sold_to_name: null, sold_to_party_member_id: null };
    const vendor = { description: "Rations", item_name: null, item_id: null, ...coin, sp: 5, paid_by_user_id: null, paid_by_name: null, paid_party_member_id: null };
    const out = openTableItems(
      [
        msg({ id: "claimed", type: "item_drop", metadata: claimedItem }),
        msg({ id: "empty", type: "loot_chest", metadata: { loot_table_id: null, loot_table_name: "E", chest_image_url: null, rolled_atoms: [], claims: [{ atom_id: "a", claimed_by_user_id: "u", claimed_by_name: "n", claimed_at: "" }], claims_total: 1 } }),
        msg({ id: "sold", type: "player_offer", metadata: { ...offer, sold_to_user_id: "u" } }),
        msg({ id: "paid", type: "vendor_offer", metadata: { ...vendor, paid_by_user_id: "u" } }),
        msg({ id: "mine", type: "player_offer", user_id: "me", metadata: offer }),
        msg({ id: "old", type: "vendor_offer", created_at: "2026-10-01T00:00:00Z", metadata: vendor }),
        msg({ id: "whisper", type: "vendor_offer", recipient_user_id: "someone", metadata: vendor }),
        msg({ id: "chat", type: "chat" }),
        msg({ id: "okOffer", type: "player_offer", user_id: "other", metadata: { ...offer, quantity: 2 } }),
        msg({ id: "okVendor", type: "vendor_offer", metadata: vendor }),
      ],
      "me",
      SINCE,
    );
    expect(out.map((i) => i.messageId).sort()).toEqual(["okOffer", "okVendor"]);
    expect(out.find((i) => i.messageId === "okOffer")).toMatchObject({ kind: "offer", title: "2× Sword", detail: "10 GP" });
    expect(out.find((i) => i.messageId === "okVendor")).toMatchObject({ kind: "vendor", title: "Rations", detail: "5 SP" });
  });
});
