import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChatItemDropMessage from "./ChatItemDropMessage.vue";
import type { ItemDropMetadata } from "@/types/chat.types";

function meta(overrides: Partial<ItemDropMetadata> = {}): ItemDropMetadata {
  return {
    item_name: "Longsword",
    item_rarity: null,
    quantity: 1,
    quantity_remaining: 1,
    claims: [],
    image_url: null,
    description: null,
    claimed_by_user_id: null,
    claimed_by_name: null,
    claimed_party_member_id: null,
    ...overrides,
  } as ItemDropMetadata;
}

function mountCard(m: ItemDropMetadata) {
  return mount(ChatItemDropMessage, { props: { meta: m, messageId: "m1" } as never });
}

describe("ChatItemDropMessage quality (#1102)", () => {
  it("shows the drop's quality", () => {
    expect(mountCard(meta({ quality: "fine" })).find('[data-quality="fine"]').text()).toBe("Fine");
  });
  it("shows nothing for a standard or unmarked drop", () => {
    expect(mountCard(meta()).find("[data-quality]").exists()).toBe(false);
    expect(mountCard(meta({ quality: "standard" })).find("[data-quality]").exists()).toBe(false);
  });
});
