import { describe, it, expect } from "vitest";
import { repeatsWorkspaceBonus } from "./workspaceModifier";

describe("repeatsWorkspaceBonus", () => {
  it("catches the two DM-written leathercraft repeats from #1091", () => {
    expect(repeatsWorkspaceBonus("leathercraft", { description: "Proper workshop available", bonus: 1 })).toBe(true);
    expect(repeatsWorkspaceBonus("leathercraft", { description: "Crafted in a proper workshop", bonus: 1 })).toBe(true);
  });

  it("catches the discipline's own label verbatim", () => {
    expect(repeatsWorkspaceBonus("smithing", { description: "Full forge available", bonus: 3 })).toBe(true);
    expect(repeatsWorkspaceBonus("alchemy", { description: "  Proper alchemist's lab available ", bonus: 2 })).toBe(true);
  });

  it("leaves conditions that are not the workspace alone", () => {
    expect(repeatsWorkspaceBonus("smithing", { description: "Assisted by a master smith", bonus: 2 })).toBe(false);
    expect(repeatsWorkspaceBonus("cooking", { description: "Fresh ingredients from the morning market", bonus: 1 })).toBe(false);
    expect(repeatsWorkspaceBonus("smithing", { description: "", bonus: 2 })).toBe(false);
  });

  it("catches generic workspace wording for any discipline", () => {
    expect(repeatsWorkspaceBonus("smithing", { description: "Proper workspace available", bonus: 2 })).toBe(true);
    expect(repeatsWorkspaceBonus("alchemy", { description: "Crafted in a proper workshop", bonus: 1 })).toBe(true);
  });

  it("leaves another discipline's workspace alone, since it is a real condition here", () => {
    expect(repeatsWorkspaceBonus("alchemy", { description: "Ingredients dried in a drying room", bonus: 1 })).toBe(false);
    expect(repeatsWorkspaceBonus("cooking", { description: "Pan hammered at a forge", bonus: 1 })).toBe(false);
    expect(repeatsWorkspaceBonus("herbalism", { description: "Ingredients dried in a drying room", bonus: 1 })).toBe(true);
  });

  it("ignores penalties, which name a situation rather than the workspace", () => {
    expect(repeatsWorkspaceBonus("cooking", { description: "Serving a full tavern", bonus: -2 })).toBe(false);
    expect(repeatsWorkspaceBonus("smithing", { description: "Forge fire banked", bonus: 0 })).toBe(false);
  });
});
