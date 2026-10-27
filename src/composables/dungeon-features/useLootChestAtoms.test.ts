import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useLootChestAtoms } from "./useLootChestAtoms";
import type { RolledLootEntry } from "@/lib/dungeon-features/lootTableRoll";

const read = vi.hoisted(() => ({ ids: [] as unknown[] }));

vi.mock("@/composables/items/useItemsByIds", () => ({
  useItemsByIds: (ids: { value: readonly string[] }) => {
    read.ids.push(ids.value);
    return {
      data: { value: new Map([["chest", { id: "chest", rarity: "common", tags: ["container"] }]]) },
      isLoading: { value: false },
    };
  },
}));

const item = (item_id: string, qty: number): RolledLootEntry => ({
  type: "item", entry_id: "e", item_id, item_name: item_id, item_image_url: null, qty, notes: null,
});

describe("useLootChestAtoms", () => {
  it("reads only the rolled ids and flags containers from the full row", () => {
    const rolled = ref<RolledLootEntry[]>([item("chest", 2), item("rope", 1)]);
    const { atoms } = useLootChestAtoms(rolled);
    expect(read.ids[0]).toEqual(["chest", "rope"]);
    expect(atoms.value).toHaveLength(3);
    expect(atoms.value[0]).toMatchObject({ item_id: "chest", item_rarity: "common", item_is_container: true });
    expect(atoms.value[2]).toMatchObject({ item_id: "rope", item_rarity: null, item_is_container: false });
  });

  it("makes an atom of a currency drop and none of an unresolved hit", () => {
    const currency: RolledLootEntry = { type: "currency", entry_id: "c", currency_label: "Purse", pp: 0, gp: 12, ep: 0, sp: 3, cp: 0, notes: null };
    const missed: RolledLootEntry = { type: "unresolved", entry_id: "u", reason: "item_deleted", wanted: "Old Blade", notes: null };
    const { atoms } = useLootChestAtoms(ref<RolledLootEntry[]>([currency, missed]));
    expect(atoms.value).toHaveLength(1);
    expect(atoms.value[0]).toMatchObject({ type: "currency", currency_label: "Purse", gp: 12, sp: 3 });
  });
});
