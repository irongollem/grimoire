import { describe, expect, it, vi } from "vitest";

const attemptCraft = vi.fn();
const sendMessage = vi.fn();
vi.mock("@/composables/crafting/useCrafting", () => ({ useAttemptCraft: () => ({ mutateAsync: attemptCraft }) }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendMessage }) }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: vi.fn() }));
const playOutcomeSting = vi.fn();
const playWorkSound = vi.fn();
vi.mock("@/lib/crafting/workbenchAudio", async (orig) => ({
  ...(await orig<typeof import("@/lib/crafting/workbenchAudio")>()),
  playOutcomeSting: (s: string) => playOutcomeSting(s),
  playWorkSound: (d: string) => playWorkSound(d),
}));

import { useCraftAttempt } from "./useCraftAttempt";
import { ref, type MaybeRefOrGetter } from "vue";
import { buildIngredientSlots, type IngredientSlot } from "@/lib/crafting/ingredients";
import type { CraftingModifier, CraftingOutput, CraftingRecipe } from "@/types/crafting.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

function slotsOf(quality: PartyInventoryItem["quality"]) {
  return buildIngredientSlots(
    [{ item_id: null, library_item_id: "iron", tags: null, quantity: 1 }],
    [{ id: "r1", library_item_id: "iron", item_id: null, quantity: 2, name: "Iron", carried_by: "m", campaign_id: "c", quality } as PartyInventoryItem],
    [],
  );
}

function setupWith(over: {
  str?: number;
  recipe?: Partial<CraftingRecipe>;
  hasTools?: boolean;
  hasProficiency?: boolean;
  modifiers?: CraftingModifier[];
  outputs?: CraftingOutput[];
  slots?: IngredientSlot[];
}) {
  return useCraftAttempt({
    recipe: { name: "Nail", dc: 10, discipline: "smithing", ...over.recipe } as unknown as CraftingRecipe,
    outputs: over.outputs ?? [],
    slots: over.slots ?? slotsOf("standard"),
    modifiers: over.modifiers ?? [],
    member: { id: "m", name: "Brann", proficiency_bonus: 2, int: 10, str: over.str ?? 10, dex: 10, con: 10, wis: 10, cha: 10 } as unknown as PartyMember,
    hasTools: over.hasTools ?? true,
    hasProficiency: over.hasProficiency ?? true,
    workspaceBonus: 0,
    allItems: [],
  });
}

function setup(quality: PartyInventoryItem["quality"] = "standard", slots: MaybeRefOrGetter<IngredientSlot[]> = slotsOf(quality)) {
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
    a.preferred.value = { 0: "r1" };
    await a.attempt();
    expect(a.result.value?.outcome).toBe("ruin");
    expect(a.chatNotice.value).not.toBeNull();
    a.reset();
    expect(a.result.value).toBeNull();
    expect(a.attemptError.value).toBeNull();
    expect(a.chatNotice.value).toBeNull();
    expect(a.preferred.value).toEqual({ 0: "r1" });
    expect(a.canAttempt.value).toBe(true);
  });

  it("feeds the quality of the spent stack into the roll and names it", () => {
    const poor = setup("poor");
    expect(poor.qualityModifier.value).toBe(-2);
    expect(poor.qualityLine.value).toBe("Poor iron");
    expect(poor.modifierBonuses.value).toEqual([-2]);
    const fine = setup("fine");
    expect(fine.modifierBonuses.value).toEqual([1]);
  });

  it("adds nothing for standard stock", () => {
    const a = setup("standard");
    expect(a.qualityModifier.value).toBe(0);
    expect(a.qualityLine.value).toBeNull();
    expect(a.modifierBonuses.value).toEqual([]);
  });

  it("keeps the rolled quality after the attempt and hands the primary row's id to the mutation", async () => {
    attemptCraft.mockResolvedValue({ roll: 10, total: 5, diff: -5, outcome: "fail", hasDisadvantage: false });
    sendMessage.mockResolvedValue(undefined);
    const a = setup("poor");
    await a.attempt();
    expect(attemptCraft.mock.calls.at(-1)?.[0].primaryInventoryItem.id).toBe("r1");
    expect(a.qualityModifier.value).toBe(-2);
    a.reset();
    expect(a.qualityModifier.value).toBe(-2); // live inventory still reads poor
  });

  it("lets go of the rolled quality when the attempt errors, so the next roll reads the new stack", async () => {
    attemptCraft.mockRejectedValue(new Error("network"));
    const slots = ref(slotsOf("poor"));
    const a = setup("poor", slots);
    await a.attempt();
    expect(a.attemptError.value).toBe("network");
    slots.value = slotsOf("fine");
    expect(a.qualityModifier.value).toBe(1);
    expect(a.qualityLine.value).toBe("Fine iron");
  });

  it("says a Fine result in the chat line", async () => {
    attemptCraft.mockResolvedValue({ roll: 20, total: 30, diff: 20, outcome: "success", hasDisadvantage: false });
    sendMessage.mockResolvedValue(undefined);
    await setup().attempt();
    expect(sendMessage.mock.calls.at(-1)?.[0]).toContain("came out Fine");
  });

  it.each([
    ["success", "success"],
    ["fail", "failure"],
    ["ruin", "critical"],
  ])("plays the %s outcome as the %s sting, and the work sound when the roll is made", async (outcome, sting) => {
    attemptCraft.mockImplementation(async (p: { onRolled: () => void }) => {
      p.onRolled();
      return { roll: 10, total: 12, diff: 2, outcome, hasDisadvantage: false };
    });
    sendMessage.mockResolvedValue(undefined);
    playOutcomeSting.mockClear();
    const a = setup();
    await a.attempt();
    expect(playWorkSound).toHaveBeenCalledWith("smithing");
    expect(playOutcomeSting).toHaveBeenCalledWith(sting);
  });

  // Smithing rolls Strength. PHB 2014 "Ability Scores and Modifiers": (score - 10) / 2, rounded down.
  it.each([
    [9, -1],
    [15, 2],
    [10, 0],
  ])("takes the Strength modifier of a %i score as %i", (str, mod) => {
    expect(setupWith({ str }).abilityMod.value).toBe(mod);
  });

  it("adds the proficiency bonus to the roll only when the player is proficient", async () => {
    attemptCraft.mockResolvedValue({ roll: 10, total: 12, diff: 2, outcome: "success", hasDisadvantage: false });
    sendMessage.mockResolvedValue(undefined);
    await setupWith({ hasProficiency: true }).attempt();
    expect(attemptCraft.mock.calls.at(-1)?.[0].profBonus).toBe(2);
    await setupWith({ hasProficiency: false }).attempt();
    expect(attemptCraft.mock.calls.at(-1)?.[0].profBonus).toBe(0);
  });

  it.each([
    ["needs proficiency the player lacks", { requires_proficiency: true }, { hasProficiency: false }],
    ["needs tools the player lacks", { requires_tools: true }, { hasTools: false }],
  ])("a recipe that %s is locked and cannot be attempted", async (_label, recipe, who) => {
    attemptCraft.mockClear();
    const a = setupWith({ recipe, ...who });
    expect(a.locked.value).toBe(true);
    expect(a.canAttempt.value).toBe(false);
    await a.attempt();
    expect(attemptCraft).not.toHaveBeenCalled();
  });

  it("is not locked when the player has what the recipe requires, and only soft-penalises missing tools", () => {
    expect(setupWith({ recipe: { requires_proficiency: true, requires_tools: true } }).locked.value).toBe(false);
    expect(setupWith({ recipe: { requires_tools: false }, hasTools: false }).locked.value).toBe(false);
  });

  it("cannot be attempted while an ingredient is short, and does not roll", async () => {
    attemptCraft.mockClear();
    const short = buildIngredientSlots(
      [{ item_id: null, library_item_id: "iron", tags: null, quantity: 5 }],
      [{ id: "r1", library_item_id: "iron", item_id: null, quantity: 2, name: "Iron", carried_by: "m", campaign_id: "c", quality: "standard" } as PartyInventoryItem],
      [],
    );
    const a = setupWith({ slots: short });
    expect(a.canAttempt.value).toBe(false);
    await a.attempt();
    expect(attemptCraft).not.toHaveBeenCalled();
  });

  it("toggling a situation bonus twice takes it off again, and a bonus whose modifier was deleted adds nothing", () => {
    const a = setupWith({ modifiers: [{ description: "Good light", bonus: 2 } as CraftingModifier] });
    a.toggleModifier(0);
    expect(a.modifierBonuses.value).toEqual([2]);
    a.toggleModifier(0);
    expect(a.modifierBonuses.value).toEqual([]);
    a.toggleModifier(5);
    expect(a.modifierBonuses.value).toEqual([]);
  });

  it("leaves an output whose name cannot be resolved out of the payload instead of sending an empty name", async () => {
    attemptCraft.mockResolvedValue({ roll: 10, total: 12, diff: 2, outcome: "success", hasDisadvantage: false });
    sendMessage.mockResolvedValue(undefined);
    await setupWith({ outputs: [{ item_id: "ghost", library_item_id: null, quantity: 1 } as CraftingOutput] }).attempt();
    expect(attemptCraft.mock.calls.at(-1)?.[0].outputItemNames).toEqual({});
  });

  it("tells the table nothing was touched when the recipe consumes nothing, and names the ingredient when it does", async () => {
    attemptCraft.mockResolvedValue({ roll: 3, total: 5, diff: -5, outcome: "ruin", hasDisadvantage: false });
    sendMessage.mockResolvedValue(undefined);
    await setupWith({ slots: [] }).attempt();
    expect(sendMessage.mock.calls.at(-1)?.[0]).toContain("nothing to ruin");
    await setupWith({}).attempt();
    expect(sendMessage.mock.calls.at(-1)?.[0]).toContain("Primary ingredient ruined");
  });
});
