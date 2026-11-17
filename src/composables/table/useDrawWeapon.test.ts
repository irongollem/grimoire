import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

const inv = ref<PartyInventoryItem[]>([]);
const mutateAsync = vi.fn();
vi.mock("@/composables/encounters/usePcAttackRows", () => ({ usePcAttackRows: () => ({ memberInventory: inv }) }));
vi.mock("@/composables/items/usePartyInventory", () => ({ useUpdateInventoryItem: () => ({ mutateAsync }) }));

import { useDrawWeapon } from "./useDrawWeapon";

const row = (id: string, name: string, slot: string | null) => ({ id, name, slot }) as unknown as PartyInventoryItem;
const rosie = { name: "Rosie" } as PartyMember;

describe("useDrawWeapon", () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    mutateAsync.mockResolvedValue(undefined);
    inv.value = [row("r", "Rapier", "main_hand"), row("b", "Longbow", null)];
  });

  it("writes the put-away then the draw, and returns the margin line", async () => {
    const line = await useDrawWeapon(() => rosie).draw("b");
    expect(mutateAsync.mock.calls.map((c) => c[0].id)).toEqual(["r", "b"]);
    expect(line).toBe("Rosie puts away Rapier and draws Longbow");
  });

  // Bug caught: the draw charged (a line returned) when the write failed.
  it("rejects and returns no line when a write fails", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("offline"));
    await expect(useDrawWeapon(() => rosie).draw("b")).rejects.toThrow("offline");
    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("refuses a weapon that is not carried without writing", async () => {
    await expect(useDrawWeapon(() => rosie).draw("ghost")).rejects.toThrow();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  // Bug caught: the old weapon put away, the new one failing to reach the hand, and the character left empty-handed.
  it("puts the old weapon back in hand when the draw itself fails", async () => {
    inv.value = [{ ...row("r", "Rapier", "main_hand"), location: "equipped", is_equipped: true } as PartyInventoryItem, row("b", "Longbow", null)];
    mutateAsync.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("offline"));
    await expect(useDrawWeapon(() => rosie).draw("b")).rejects.toThrow("offline");
    expect(mutateAsync.mock.calls.at(-1)?.[0]).toEqual({ id: "r", update: { location: "equipped", slot: "main_hand", is_equipped: true } });
  });
});
