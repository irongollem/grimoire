import { describe, expect, it } from "vitest";
import {
  StatblockParseError,
  extractBlock,
  parseAbilities,
  parseBlock,
  parseMeta,
  parseStatblockFile,
  splitImmunities,
  stripMarkdown,
} from "./statblockMarkdown.ts";

const CANDY_ARCHER = `# Candy Archer

Some prose around the block.

::: statblock
name: Candy Archer
meta: Medium Construct, Unaligned
ac: 15
initiative: +3 (13)
hp: 45 (7d8 + 14)
speed: 30 ft.
abilities: STR 9 -1 -1 | DEX 17 +3 +5 | CON 14 +2 +2 | INT 6 -2 -2 | WIS 12 +1 +1 | CHA 5 -3 -3
skills: Perception +3
vulnerabilities: Thunder
resistances:
immunities: Poison, Psychic; Charmed, Exhaustion, Poisoned
gear:
senses: Darkvision 60 ft.; Passive Perception 13
languages: Understands Common but can't speak
cr: 2 (XP 450; PB +2)
traits:
- **Brittle Sweetness.** When the archer takes Thunder damage, it
  takes an extra 3 damage.
actions:
- **Multiattack.** The archer makes two Sugar-Glass Arrow attacks.
- **Sugar-Glass Arrow.** _Ranged Attack Roll:_ +5, range 80/320 ft. _Hit:_ 7 (1d8 + 3) Piercing damage.
- **Sticky Burst (Recharge 5–6).** _Dexterity Saving Throw:_ DC 13, each creature in a 10-foot-radius Sphere centered on a point within 60 feet. _Failure:_ 10 (3d6) Bludgeoning damage, and the target has the Restrained condition until the end of its next turn. _Success:_ Half damage only.
bonus_actions:
reactions:
legendary_actions:
:::
`;

describe("small readers", () => {
  it("strips bold and italic markers", () => {
    expect(stripMarkdown("**Hit:** _Hit:_ 7 (1d8)")).toBe("Hit: Hit: 7 (1d8)");
  });
  it("finds the block", () => {
    expect(extractBlock("x\n::: statblock\nname: A\n:::\ny")).toBe("name: A\n");
    expect(extractBlock("nothing")).toBeNull();
  });
  it("splits damage from conditions on the semicolon", () => {
    expect(splitImmunities("Poison, Psychic; Charmed, Poisoned")).toEqual({ damage: "Poison, Psychic", conditions: "Charmed, Poisoned" });
    expect(splitImmunities("Fire")).toEqual({ damage: "Fire", conditions: "" });
    expect(splitImmunities("")).toEqual({ damage: "", conditions: "" });
  });
  it("reads size, type, tags and alignment", () => {
    expect(parseMeta("Medium Construct, Unaligned")).toEqual({ size: "medium", monster_type: "construct", alignment: "unaligned", tags: [] });
    expect(parseMeta("Large Humanoid (Goblinoid), Lawful Evil")).toMatchObject({
      size: "large",
      monster_type: "humanoid",
      tags: ["goblinoid"],
      alignment: "lawful evil",
    });
    expect(() => parseMeta("Medium Gizmo, Unaligned")).toThrow(StatblockParseError);
  });
  it("reads abilities with a unicode minus", () => {
    const a = parseAbilities("STR 9 −1 −1 | DEX 17 +3 +5 | CON 14 +2 +2 | INT 6 -2 -2 | WIS 12 +1 +1 | CHA 5 -3 -3");
    expect(a.str).toEqual({ score: 9, mod: -1, save: -1 });
    expect(() => parseAbilities("STR 9 -1 -1")).toThrow(StatblockParseError);
  });
});

describe("parseBlock", () => {
  it("joins wrapped list items", () => {
    const parsed = parseBlock(extractBlock(CANDY_ARCHER) ?? "");
    expect(parsed.sections.traits).toEqual([
      { name: "Brittle Sweetness", description: "When the archer takes Thunder damage, it takes an extra 3 damage." },
    ]);
    expect(parsed.sections.actions.map((a) => a.name)).toEqual(["Multiattack", "Sugar-Glass Arrow", "Sticky Burst (Recharge 5–6)"]);
    expect(parsed.sections.bonus_actions).toEqual([]);
  });
  it("rejects an item without a bold name", () => {
    expect(() => parseBlock("actions:\n- just text")).toThrow(StatblockParseError);
  });
});

describe("parseStatblockFile", () => {
  const row = parseStatblockFile(CANDY_ARCHER);

  it("maps the scalar fields onto the stored shape", () => {
    expect(row).toMatchObject({
      name: "Candy Archer",
      monster_type: "construct",
      size: "medium",
      alignment: "unaligned",
      ruleset: "2024",
      source: "Sothery: A Campaign Setting",
      notes: null,
    });
    expect(row.stat_block).toMatchObject({
      armor_class: 15,
      hit_points: "45 (7d8 + 14)",
      speed: "30 ft.",
      dex: 17,
      challenge_rating: "2",
      proficiency_bonus: 2,
      initiative_bonus: 3,
      saving_throws: "Dex +5",
      skills: { perception: "+3" },
      senses: "Darkvision 60 ft.; Passive Perception 13",
      languages: "Understands Common but can't speak",
    });
  });

  it("stores typed defenses and no prose defense strings", () => {
    const sb = row.stat_block as unknown as Record<string, unknown>;
    expect(sb.damage_immunities).toBeUndefined();
    expect(sb.condition_immunities).toBeUndefined();
    expect(row.stat_block.defenses).toMatchObject({
      vulnerabilities: [{ types: ["thunder"] }],
      immunities: [{ types: ["poison", "psychic"] }],
      condition_immunities: ["Charmed", "Exhaustion", "Poisoned"],
      resistances: [],
    });
  });

  it("structures every entry", () => {
    const actions = row.stat_block.actions ?? [];
    expect(actions.map((a) => a.structured.kind)).toEqual(["multiattack", "attack", "save"]);
    expect(actions[1].structured.attack).toMatchObject({ bonus: 5, delivery: "ranged", range: { normal: 80, long: 320 } });
    expect(actions[2].structured.recharge).toEqual({ min: 5, max: 6 });
    expect(actions[2].structured.save).toMatchObject({ ability: "dex", dc: 13, success: "half" });
    expect(actions[0].structured.multiattack).toEqual([{ action: "Sugar-Glass Arrow", count: 2 }]);
    expect(actions[1].description).toBe("Ranged Attack Roll: +5, range 80/320 ft. Hit: 7 (1d8 + 3) Piercing damage.");
    expect(row.stat_block.special_abilities?.[0].structured.source).toBe("parsed");
  });

  it("leaves empty lists out and keeps gear in notes", () => {
    const sb = row.stat_block as unknown as Record<string, unknown>;
    expect(sb.bonus_actions).toBeUndefined();
    expect(sb.legendary_actions).toBeUndefined();
    expect(parseStatblockFile(CANDY_ARCHER.replace("gear:", "gear: Spiced bow")).notes).toBe("Gear: Spiced bow");
  });

  it("reads legendary resistance and a fractional CR", () => {
    const text = CANDY_ARCHER.replace("cr: 2 (XP 450; PB +2)", "cr: 1/2 (XP 100; PB +2)").replace(
      "traits:\n",
      "traits:\n- **Legendary Resistance (3/Day).** If the archer fails a saving throw, it can choose to succeed instead.\n",
    );
    const r = parseStatblockFile(text);
    expect(r.stat_block.challenge_rating).toBe("1/2");
    expect(r.stat_block.legendary_resistance).toBe(3);
  });

  it("names what is wrong", () => {
    expect(() => parseStatblockFile("no block")).toThrow("no `::: statblock` block");
    expect(() => parseStatblockFile(CANDY_ARCHER.replace("hp: 45 (7d8 + 14)", "hp:"))).toThrow('"hp" is missing');
  });
});
