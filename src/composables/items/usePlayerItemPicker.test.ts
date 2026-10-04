import { describe, expect, it } from "vitest";
import { projectionIndexEntry } from "@/composables/items/usePlayerItemPicker";
import type { Item } from "@/types/item.types";

describe("projectionIndexEntry", () => {
  it("keeps the slim picker fields and marks the row as the player's custom item", () => {
    const item = {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Moonblade",
      item_type: "weapon",
      rarity: "rare",
      source: null,
      image_url: null,
      campaign_id: "camp-1",
      description: "long text never carried into the picker",
    } as unknown as Item;
    expect(projectionIndexEntry(item)).toEqual({
      id: item.id,
      name: "Moonblade",
      item_type: "weapon",
      rarity: "rare",
      source: null,
      source_document_key: null,
      source_record_key: null,
      image_url: null,
      is_shared: false,
      campaign_id: "camp-1",
      ruleset: null,
    });
  });
});
