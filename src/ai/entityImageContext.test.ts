import { describe, it, expect } from "vitest";
import {
  npcImageContext,
  partyMemberImageContext,
  monsterImageContext,
  itemImageContext,
  spellImageContext,
} from "./entityImageContext";

describe("entityImageContext", () => {
  it("joins an npc's facts and drops empty ones", () => {
    const tiptap = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Scarred cheek" }] }] });
    expect(
      npcImageContext({ name: "Mara", race: "Elf", occupation: null, appearance: tiptap, personality: null }),
    ).toBe("Mara. Elf. Scarred cheek");
  });

  it("describes a party member by species, class and level", () => {
    expect(
      partyMemberImageContext({ name: "Bo", speciesName: "Dwarf", subrace: "Hill", className: "Cleric", level: 3 }),
    ).toBe("Bo. Dwarf Hill. Cleric. level 3");
  });

  it("describes a monster", () => {
    expect(
      monsterImageContext({ name: "Owlbear", size: "large", monster_type: "monstrosity", alignment: "unaligned", habitat: null }),
    ).toBe("Owlbear. large monstrosity. unaligned");
  });

  it("describes an item with its labels", () => {
    expect(itemImageContext({ name: "Ring", description: "Glows." }, { type: "Ring", rarity: "Rare" })).toBe(
      "Ring. Ring. Rare. Glows.",
    );
  });

  it("calls a level 0 spell a cantrip", () => {
    expect(spellImageContext({ name: "Light", level: 0, school: "evocation", description: "A glow." })).toBe(
      "Light. cantrip evocation spell. A glow.",
    );
  });
});
