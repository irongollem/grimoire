import { describe, expect, it, vi } from "vitest";

const attemptCraft = vi.fn();
const sendMessage = vi.fn();
vi.mock("@/composables/crafting/useCrafting", () => ({ useAttemptCraft: () => ({ mutateAsync: attemptCraft }) }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendMessage }) }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));

import { useCraftAttempt } from "./useCraftAttempt";
import { buildIngredientSlots } from "@/lib/crafting/ingredients";
import type { CraftingRecipe } from "@/types/crafting.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

function setup() {
  const slots = buildIngredientSlots(
    [{ item_id: null, library_item_id: "iron", tags: null, quantity: 1 }],
    [{ id: "r1", library_item_id: "iron", item_id: null, quantity: 2, name: "Iron", carried_by: "m", campaign_id: "c" } as PartyInventoryItem],
    [],
  );
  return useCraftAttempt({
    recipe: { name: "Nail", dc: 10, discipline: "smithing" } as unknown as CraftingRecipe,
    outputs: [],
    slots,
    modifiers: [],
    member: { id: "m", name: "Brann", proficiency_bonus: 2, int: 14, str: 10, dex: 10, con: 10, wis: 10, cha: 10 } as unknown as PartyMember,
    hasTools: true,
    hasProficiency: true,
    workspaceBonus: 0,
    allItems: [],
  });
}

describe("useCraftAttempt", () => {
  it("ignores a second attempt while one is running", async () => {
    let finish: (v: unknown) => void = () => {};
    attemptCraft.mockReturnValue(new Promise((r) => { finish = r; }));
    sendMessage.mockResolvedValue(undefined);
    const a = setup();
    const first = a.attempt();
    await a.attempt();
    expect(attemptCraft).toHaveBeenCalledTimes(1);
    expect(attemptCraft.mock.calls[0][0].ingredientConsumption).toEqual([{ id: "r1", qty: 1 }]);
    expect(attemptCraft.mock.calls[0][0].primaryConsumption).toEqual([{ id: "r1", qty: 1 }]);
    finish({ roll: 10, total: 12, diff: 2, outcome: "success", hasDisadvantage: false });
    await first;
    expect(a.result.value?.outcome).toBe("success");
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("surfaces a chat failure as a notice, not an error", async () => {
    attemptCraft.mockResolvedValue({ roll: 10, total: 12, diff: 2, outcome: "fail", hasDisadvantage: false });
    sendMessage.mockRejectedValue(new Error("x"));
    const a = setup();
    await a.attempt();
    expect(a.chatNotice.value).toContain("could not be posted");
    expect(a.attemptError.value).toBeNull();
    expect(a.attempting.value).toBe(false);
  });

  it("reset clears the result and notices so the player can try again", async () => {
    attemptCraft.mockResolvedValue({ roll: 3, total: 5, diff: -5, outcome: "ruin", hasDisadvantage: false });
    sendMessage.mockRejectedValue(new Error("x"));
    const a = setup();
    a.poorIngredientsEnabled.value = true;
    a.preferred.value = { 0: "r1" };
    await a.attempt();
    expect(a.result.value?.outcome).toBe("ruin");
    expect(a.chatNotice.value).not.toBeNull();
    a.reset();
    expect(a.result.value).toBeNull();
    expect(a.attemptError.value).toBeNull();
    expect(a.chatNotice.value).toBeNull();
    expect(a.poorIngredientsEnabled.value).toBe(true);
    expect(a.preferred.value).toEqual({ 0: "r1" });
    expect(a.canAttempt.value).toBe(true);
  });
});
