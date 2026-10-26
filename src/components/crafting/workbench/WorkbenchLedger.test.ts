import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkbenchLedger from "./WorkbenchLedger.vue";
import { getDiscipline } from "@/lib/crafting/disciplines";
import type { IngredientSlot } from "@/lib/crafting/ingredients";
import type { CraftingAttemptResult, CraftingRecipe } from "@/types/crafting.types";

const recipe = { id: "r1", name: "Longsword", discipline: "smithing", dc: 15, crafting_time: 2, crafting_time_unit: "days", requires_proficiency: false, requires_tools: false } as CraftingRecipe;

function slot(met: boolean): IngredientSlot {
  return { index: 0, requirement: { item_id: "i", library_item_id: null, tags: null, quantity: 2 }, ref: "i", tags: null, name: "Iron Ingot", needed: 2, available: met ? 2 : 0, met, candidates: [] };
}

function mountLedger(over: Record<string, unknown> = {}) {
  return mount(WorkbenchLedger, {
    props: {
      recipe,
      discipline: getDiscipline("smithing"),
      modifiers: [],
      slots: [slot(true)],
      abilityMod: 3,
      profBonus: 2,
      hasProficiency: true,
      hasTools: true,
      modifierBonuses: [],
      selectedModifiers: new Set<number>(),
      canAttempt: true,
      attempting: false,
      result: null,
      outputNames: ["Longsword"],
      recipeArt: null,
      short: false,
      attemptError: null,
      chatNotice: null,
      workspace: false,
      qualityMod: 0,
      qualityLine: null,
      fine: false,
      degradeLine: null,
      ...over,
    },
    global: { stubs: { FocalImage: true, RouterLink: { template: "<a><slot /></a>" } } },
  });
}

describe("WorkbenchLedger", () => {
  it("states the rules and enables the attempt when everything is in hand", () => {
    const w = mountLedger();
    expect(w.text()).toContain("d20 + 3 STR + proficiency 2");
    expect(w.text()).toContain("d20 + 5 against DC 15");
    expect(w.get("button").attributes("disabled")).toBeUndefined();
  });

  it("disables the attempt and names what is missing", () => {
    const w = mountLedger({ slots: [slot(false)], canAttempt: false });
    expect(w.get("button").attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("Missing: Iron Ingot.");
  });

  it("writes the roll out after the attempt", () => {
    const result: CraftingAttemptResult = { roll: 14, total: 22, diff: 7, outcome: "success", hasDisadvantage: false };
    const w = mountLedger({ result });
    expect(w.text()).toContain("Success");
    expect(w.text()).toContain("Rolled 14 + 5 = 22 against DC 15");
    expect(w.text()).toContain("Posted to the campaign chat.");
    expect(w.text()).toContain("Done");
  });

  it("reports disadvantage as two dice and the one taken", () => {
    const result: CraftingAttemptResult = { roll: 6, roll2: 14, total: 11, diff: -4, outcome: "fail", hasDisadvantage: true };
    expect(mountLedger({ result }).text()).toContain("Rolled 14 and 6, took 6");
  });

  it("states what each outcome costs under the attempt button", () => {
    expect(mountLedger().text()).toContain("A success spends every ingredient. A failure costs the time and makes the primary ingredient one step worse; a critical failure ruins it.");
  });

  it("states ingredient quality as a read-only line, and nothing when all is standard", () => {
    expect(mountLedger().find("[data-testid=quality-line]").exists()).toBe(false);
    expect(mountLedger().text()).not.toContain("Poor ingredients");
    const w = mountLedger({ qualityMod: -1, qualityLine: "Poor leather, fine ingots" });
    expect(w.get("[data-testid=quality-line]").text()).toBe("Poor leather, fine ingots\u22121");
    expect(mountLedger({ qualityMod: 1, qualityLine: "Fine ingots" }).get("[data-testid=quality-line]").text()).toContain("+1");
    // Fine and Poor stock cancelling out still shows, so the player sees quality counted.
    expect(mountLedger({ qualityMod: 0, qualityLine: "Fine ingots, poor leather" }).get("[data-testid=quality-line]").text()).toContain("\u00b10");
  });

  it("says what a failure did to the primary ingredient, and that a high roll came out Fine", () => {
    const fail: CraftingAttemptResult = { roll: 6, total: 11, diff: -4, outcome: "fail", hasDisadvantage: false };
    expect(mountLedger({ result: fail, degradeLine: "Your Iron Ingot is now Poor." }).text()).toContain("Your Iron Ingot is now Poor.");
    const ok: CraftingAttemptResult = { roll: 20, total: 27, diff: 12, outcome: "success", hasDisadvantage: false };
    expect(mountLedger({ result: ok, fine: true }).text()).toContain("came out Fine");
  });

  it("offers Try again beside Done after a failure, and only Done after a success", async () => {
    const fail: CraftingAttemptResult = { roll: 6, total: 11, diff: -4, outcome: "fail", hasDisadvantage: false };
    const w = mountLedger({ result: fail });
    const retry = w.findAll("button").find((b) => b.text() === "Try again");
    expect(retry).toBeDefined();
    await retry?.trigger("click");
    expect(w.emitted("retry")).toHaveLength(1);
    expect(w.text()).toContain("Done");
    const ok: CraftingAttemptResult = { roll: 14, total: 22, diff: 7, outcome: "success", hasDisadvantage: false };
    expect(mountLedger({ result: ok }).text()).not.toContain("Try again");
  });
});
