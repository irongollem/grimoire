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

function mountColumn(props: { column: PackColumnData; faded?: boolean; query?: string; dmOnly?: boolean; stacked?: boolean; startOpen?: boolean }) {
  return mount(PackColumn, {
    props: {
      column: props.column,
      query: props.query ?? "",
      stacked: props.stacked ?? false,
      faded: props.faded ?? false,
      startOpen: props.startOpen ?? true,
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

  it("says how much is hidden when a pack has no match", () => {
    const w = mountColumn({ column: column({ sections: [], hidden: 3, subline: "nothing matches" }), faded: true });
    expect(w.text()).toContain("3 things hidden");
  });

  it("says 'more hidden' when a pack shows some of its rows", () => {
    expect(mountColumn({ column: column({ hidden: 2 }) }).text()).toContain("2 more hidden");
  });

  it("shows a quantity only when there is more than one", () => {
    const w = mountColumn({ column: column({ sections: [{ key: "b", label: "Backpack", container: null, rows: [row({ id: "a", name: "Rope", quantity: 3 }), row({ id: "b", name: "Lamp", quantity: 1 })] }] }) });
    expect(w.text()).toContain("×3");
    expect(w.text()).not.toContain("×1");
  });

  it("says what an empty pack holds: the stash and a character differ, and a faded one stays quiet", () => {
    const empty = { sections: [], hidden: 0 };
    expect(mountColumn({ column: column({ ...empty, memberId: null }) }).text()).toContain("Nothing in the stash.");
    expect(mountColumn({ column: column(empty) }).text()).toContain("Carrying nothing.");
    expect(mountColumn({ column: column(empty), faded: true }).text()).not.toContain("Carrying nothing.");
  });

  it("wears a character's initials when there is no portrait", () => {
    expect(mountColumn({ column: column({ title: "Ilse Brandt" }) }).find(".pack-face").text()).toBe("IB");
  });

  it("on a phone folds the pack open and shut from its head, and shows the state to assistive tech", async () => {
    const w = mountColumn({ column: column(), stacked: true, startOpen: false });
    const head = w.get("button.pack-head");
    const body = () => w.get(".pack-head + div").attributes("style") ?? "";
    expect(head.attributes("aria-expanded")).toBe("false");
    expect(body()).toContain("display: none");
    await head.trigger("click");
    expect(head.attributes("aria-expanded")).toBe("true");
    expect(body()).not.toContain("display: none");
  });

  it("on a wide screen the head is a link to the character's pack, not a fold button", () => {
    const w = mountColumn({ column: column(), stacked: false });
    expect(w.find("button.pack-head").exists()).toBe(false);
    expect(w.find(".pack-head + div").attributes("style") ?? "").not.toContain("display: none");
  });

  it("passes a row menu's actions up with the row they came from", async () => {
    const r = row({ id: "r9", name: "Rope" });
    const w = mountColumn({ column: column({ sections: [{ key: "b", label: "Backpack", container: null, rows: [r] }] }) });
    const menu = w.findComponent({ name: "PackRowMenu" });
    menu.vm.$emit("attune");
    menu.vm.$emit("drop");
    menu.vm.$emit("remove");
    menu.vm.$emit("count", -1);
    expect(w.emitted("attune")).toEqual([[r]]);
    expect(w.emitted("drop")).toEqual([[r]]);
    expect(w.emitted("remove")).toEqual([[r]]);
    expect(w.emitted("count")).toEqual([[r, -1]]);
  });
});
