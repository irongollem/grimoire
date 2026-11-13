import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ChatLootChestMessage from "./ChatLootChestMessage.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { LootChestMetadata } from "@/types/chat.types";

const meta = {
  loot_table_id: "t1",
  loot_table_name: "Goblin hoard",
  chest_image_url: "/chest.webp",
  rolled_atoms: [
    { atom_id: "a1", type: "item", item_name: "Moonblade", item_image_url: "/moonblade.webp", item_rarity: "rare" },
  ],
  claims: [],
  claims_total: 1,
} as unknown as LootChestMetadata;

const mountChest = () => mount(ChatLootChestMessage, { props: { messageId: "m1", meta, senderName: "DM" } });

describe("ChatLootChestMessage low art (#1179)", () => {
  afterEach(() => {
    useLowArt().setLowArt(false);
  });

  it("draws the chest and item art normally", () => {
    expect(mountChest().findAll("img").length).toBeGreaterThan(0);
  });

  it("downloads no chest or item picture in low art, and the rolled item is still named", () => {
    useLowArt().setLowArt(true);
    const w = mountChest();
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("Moonblade");
  });
});
