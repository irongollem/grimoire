import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import type { PartyInventoryItem } from "@/types/inventory.types";
import PackColumn, { type PackColumnData } from "./PackColumn.vue";

function row(over: Partial<PartyInventoryItem>): PartyInventoryItem {
  return {
    id: "r1", campaign_id: "c", user_id: "u", item_id: null, library_item_id: null, name: "Amulet of Health",
    quantity: 1, carried_by: "m1", location: "backpack", slot: null, is_container: false, container_id: null,
    is_attuned: false, is_equipped: false, notes: null, current_charges: null, updated_at: "", is_identified: true,
    quality: "standard", sort_order: 0, curse_revealed: false, ...over,
  } as PartyInventoryItem;
}

function column(over: Partial<PackColumnData> = {}): PackColumnData {
  return {
    key: "m1", memberId: "m1", title: "Ilse Brandt", subline: "10 / 120 lb · ✦ 1/3 · 4 gp", portraitUrl: null,
    link: "/party/m1?tab=inventory", sections: [{ key: "backpack", label: "Backpack", container: null, rows: [row({})] }],
    hidden: 0, ...over,
  };
}

function mountColumn(props: { column: PackColumnData; faded?: boolean; query?: string; dmOnly?: boolean }) {
  return mount(PackColumn, {
    props: {
      column: props.column,
      query: props.query ?? "",
      stacked: false,
      faded: props.faded ?? false,
      startOpen: true,
      rarityOf: () => null,
      isDmOnly: () => props.dmOnly ?? false,
      giveTargetsFor: () => [],
    },
    global: { stubs: { RouterLink: { template: "<a><slot /></a>" }, PackRowMenu: true } },
  });
}

describe("PackColumn", () => {
  it("shows the head line and rows under their sub-heads", () => {
    const w = mountColumn({ column: column() });
    expect(w.text()).toContain("Ilse Brandt");
    expect(w.text()).toContain("10 / 120 lb");
    expect(w.text()).toContain("Backpack");
    expect(w.text()).toContain("Amulet of Health");
  });

  it("marks the match and flags what the party does not know", () => {
    const w = mountColumn({ column: column(), query: "heal", dmOnly: true });
    expect(w.find("mark").text()).toBe("heal".replace("heal", "Heal"));
    expect(w.text()).toContain("DM");
  });

  it("fades a pack with no match and says how much is hidden", () => {
    const w = mountColumn({ column: column({ sections: [], hidden: 3, subline: "nothing matches" }), faded: true });
    expect(w.classes()).toContain("opacity-45");
    expect(w.text()).toContain("3 things hidden");
  });

  it("says 'more hidden' when a pack shows some of its rows", () => {
    expect(mountColumn({ column: column({ hidden: 2 }) }).text()).toContain("2 more hidden");
  });
});
