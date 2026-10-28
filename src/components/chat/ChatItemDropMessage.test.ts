import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ChatItemDropMessage from "./ChatItemDropMessage.vue";
import type { ItemDropClaim, ItemDropMetadata } from "@/types/chat.types";

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

function mountCard(m: ItemDropMetadata, extra: Record<string, unknown> = {}) {
  return mount(ChatItemDropMessage, {
    props: { meta: m, messageId: "m1", senderName: "DM", timeLabel: "10:00", ...extra } as never,
    global: { stubs: { EntityCombobox: { props: ["options"], emits: ["update:modelValue"], name: "NpcPickStub", template: "<div class='npc-pick' />" } } },
  });
}
const claim = (user_id: string, name: string, qty: number): ItemDropClaim => ({ user_id, name, qty, party_member_id: null, at: "2026-10-01T10:00:00Z" });
const stack = (over: Partial<ItemDropMetadata> = {}) =>
  meta({ item_name: "Arrow", quantity: 5, quantity_remaining: 5, claims: [], ...over });
const button = (w: ReturnType<typeof mountCard>, label: string) => w.findAll("button").find((b) => b.text() === label);

describe("ChatItemDropMessage quality (#1102)", () => {
  it("shows the drop's quality", () => {
    expect(mountCard(meta({ quality: "fine" })).find('[data-quality="fine"]').text()).toBe("Fine");
  });
  it("shows nothing for a standard or unmarked drop", () => {
    expect(mountCard(meta()).find("[data-quality]").exists()).toBe(false);
    expect(mountCard(meta({ quality: "standard" })).find("[data-quality]").exists()).toBe(false);
  });
});

describe("ChatItemDropMessage claiming", () => {
  it("offers a stack's grab buttons only to a player with a character, and a single item just Grab", () => {
    expect(mountCard(stack()).findAll("button")).toHaveLength(0);
    const seated = mountCard(stack(), { linkedPartyMemberId: "pm1" });
    expect(["Grab 1", "Grab All", "To Stash"].map((l) => !!button(seated, l))).toEqual([true, true, true]);
    const single = mountCard(meta({ claims: [] }), { linkedPartyMemberId: "pm1" });
    expect(button(single, "Grab 1")).toBeUndefined();
    expect(button(single, "Grab")).toBeDefined();
  });

  it("asks for one, all, or the stash with the amounts the server expects (-1 is all)", async () => {
    const w = mountCard(stack(), { linkedPartyMemberId: "pm1" });
    await button(w, "Grab 1")!.trigger("click");
    await button(w, "Grab All")!.trigger("click");
    await button(w, "To Stash")!.trigger("click");
    expect(w.emitted("grab")).toEqual([
      [{ messageId: "m1", qty: 1, intoStash: false }],
      [{ messageId: "m1", qty: -1, intoStash: false }],
      [{ messageId: "m1", qty: -1, intoStash: true }],
    ]);
  });

  it("offers nothing once every one is claimed, and names who took them", () => {
    const w = mountCard(stack({ quantity_remaining: 0, claims: [claim("u1", "Mira", 2), claim("u2", "Tam", 3)] }), { linkedPartyMemberId: "pm1" });
    expect(w.findAll("button").filter((b) => /Grab|Stash/.test(b.text()))).toHaveLength(0);
    expect(w.text()).toMatch(/All claimed\s+by Mira, Tam/);
  });

  it("adds up what one person grabbed across several grabs", () => {
    const w = mountCard(stack({ quantity_remaining: 1, claims: [
      claim("u1", "Mira", 1), claim("u2", "Tam", 1), claim("u1", "Mira", 2),
    ] }));
    expect(w.text()).toContain("Grabbed by Mira ×3, Tam");
    expect(w.text()).toContain("(1 left)");
  });

  it("says nothing is left only for a partly claimed stack of more than one", () => {
    expect(mountCard(stack()).text()).not.toContain("left)");
    expect(mountCard(meta({ claims: [] })).text()).not.toContain("left)");
  });

  it("gives the loot to the NPC the DM picks, and ignores a pick that is not on the list", async () => {
    expect(mountCard(stack(), { npcs: [{ id: "n1", name: "Brakka" }] }).find(".npc-pick").exists()).toBe(false);
    const w = mountCard(stack(), { isDM: true, npcs: [{ id: "n1", name: "Brakka" }] });
    const pick = w.findComponent({ name: "NpcPickStub" });
    pick.vm.$emit("update:modelValue", "n1");
    pick.vm.$emit("update:modelValue", "");
    pick.vm.$emit("update:modelValue", "ghost");
    expect(w.emitted("claim-to-npc")).toEqual([[{ messageId: "m1", npcId: "n1", npcName: "Brakka" }]]);
  });
});
