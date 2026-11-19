import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import StatBlockTacticsSummary from "./StatBlockTacticsSummary.vue";
import { emptyDefenses } from "@/types/statBlock.types";
import type { MonsterStatBlock, MonsterType } from "@/types/monster.types";

function block(over: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return {
    armor_class: 12, hit_points: "2d8", speed: "30 ft.",
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    challenge_rating: "1", defenses: emptyDefenses(), ...over,
  };
}

const read = (sb: MonsterStatBlock, creatureType: MonsterType | null = "humanoid") =>
  mount(StatBlockTacticsSummary, { props: { sb, creatureType } }).text();

// App convention throughout (#1203): the books do not say how a monster thinks.
describe("StatBlockTacticsSummary", () => {
  it("reads out what the DM set over what the stat block suggests, with the note", () => {
    // Plain block: a brute that goes for the most wounded. Both are overridden here.
    const text = read(block({ tactics: { role: "lurker", targets: "lowest_armor", note: "Guards the door" } }));
    expect(text).toContain("Fights as a lurker.");
    expect(text).toContain("Goes for the lowest armor.");
    expect(text).toContain("Guards the door");
    expect(read(block())).toContain("Fights as a brute."); // positive control: without them the derived role shows
  });

  it("takes the creature's kind into account: the same block is fearless as an undead", () => {
    // RULE morale (profile.ts): an undead never breaks, a thinking humanoid flees.
    expect(read(block(), "undead")).toContain("Fights to the death.");
    expect(read(block(), "humanoid")).not.toContain("Fights to the death.");
  });
});
