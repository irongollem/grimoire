import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChatItemDropMessage from "./ChatItemDropMessage.vue";
import type { ItemDropMetadata, LootRoll, LootRollEntry } from "@/types/chat.types";

const FAR = new Date(Date.now() + 60_000).toISOString();

function entry(id: string, name: string, choice: LootRollEntry["choice"], roll: number | null): LootRollEntry {
  return { party_member_id: id, user_id: `u-${id}`, name, choice, roll, at: new Date().toISOString() };
}

function mountDrop(roll: Partial<LootRoll>, opts: { isDM?: boolean; linked?: string | null; claims?: ItemDropMetadata["claims"]; remaining?: number } = {}) {
  const meta: ItemDropMetadata = {
    item_id: null, item_name: "Ring", item_rarity: null, quantity: 1,
    quantity_remaining: opts.remaining ?? 1,
    claims: opts.claims ?? [],
    claimed_by_user_id: null, claimed_by_name: null, claimed_party_member_id: null,
    roll: { seconds: 30, closes_at: FAR, entries: [], resolved_at: null, outcome: null, ...roll },
  };
  return mount(ChatItemDropMessage, {
    props: { messageId: "m1", meta, senderName: "DM", isDM: opts.isDM ?? false, linkedPartyMemberId: opts.linked === undefined ? "pm1" : opts.linked, timeLabel: "now" },
  });
}

const labels = (w: ReturnType<typeof mountDrop>) => w.findAll("button").map(b => b.text());

describe("Need or Greed panel in a drop", () => {
  it("offers Need, Greed and Pass to a linked player who has not chosen, and emits the pick", async () => {
    const w = mountDrop({});
    expect(labels(w)).toEqual(expect.arrayContaining(["Need", "Greed", "Pass"]));
    await w.findAll("button").find(b => b.text() === "Greed")!.trigger("click");
    expect(w.emitted("loot-roll-choose")![0]).toEqual([{ messageId: "m1", choice: "greed" }]);
  });

  it("shows no choices once the character has chosen, and shows their roll instead", () => {
    const w = mountDrop({ entries: [entry("pm1", "Mira", "need", 87)] });
    expect(labels(w)).not.toContain("Need");
    expect(w.text()).toContain("You chose Need 87");
  });

  it("offers no choices to a viewer with no seated character", () => {
    expect(labels(mountDrop({}, { linked: null }))).not.toContain("Need");
  });

  it("shows End roll to the DM only", async () => {
    expect(labels(mountDrop({}))).not.toContain("End roll");
    const dm = mountDrop({}, { isDM: true, linked: null });
    await dm.findAll("button").find(b => b.text() === "End roll")!.trigger("click");
    expect(dm.emitted("loot-roll-end")![0]).toEqual([{ messageId: "m1" }]);
  });

  it("hides Grab and To Stash while the roll is open", () => {
    const l = labels(mountDrop({}));
    expect(l).not.toContain("Grab");
    expect(l).not.toContain("To Stash");
  });

  it("brings the grab buttons back when everyone passed", () => {
    const w = mountDrop({ resolved_at: new Date().toISOString(), outcome: "unclaimed", entries: [entry("pm1", "Mira", "pass", null)] });
    expect(w.text()).toContain("Everyone passed, free to grab");
    expect(labels(w)).toContain("Grab");
  });

  it("names the winner with their choice and roll after a win", () => {
    const w = mountDrop(
      { resolved_at: new Date().toISOString(), outcome: "won", entries: [entry("pm2", "Tor", "greed", 99), entry("pm1", "Mira", "need", 12)] },
      { claims: [{ user_id: "u-pm1", name: "Mira", party_member_id: "pm1", qty: 1, at: "" }], remaining: 0 },
    );
    // Need beats Greed even with the lower roll.
    expect(w.text()).toContain("Won by Mira (Need 12)");
  });
});
