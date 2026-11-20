import { describe, expect, it } from "vitest";
import type { MonsterStatBlock, MonsterType } from "../../../types/monster.types.ts";
import { emptyDefenses, type StatBlockEntry } from "../../../types/statBlock.types.ts";
import { type MoraleRule, cleverTier, tacticalProfile } from "./profile.ts";
// oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field (#1203), not a promise
const morale = (breaksAt: number, then: MoraleRule["then"]): MoraleRule => ({ breaksAt, then });


function block(over: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return {
    armor_class: 12,
    hit_points: "2d8",
    speed: "30 ft.",
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    challenge_rating: "1",
    defenses: emptyDefenses(),
    ...over,
  };
}
const attack = (name: string, delivery: "melee" | "ranged" | "melee_or_ranged"): StatBlockEntry => ({
  name,
  description: "",
  structured: { source: "manual", kind: "attack", attack: { delivery, bonus: 4, hit: [] } },
});
const saveEntry: StatBlockEntry = { name: "Roar", description: "", structured: { source: "manual", kind: "save" } };
const profile = (over: Partial<MonsterStatBlock> = {}, type: MonsterType | null = "humanoid") => tacticalProfile(block(over), type);

describe("rule cleverness-tier: Intelligence", () => {
  it.each([
    [3, "instinct"],
    [4, "simple"],
    [7, "simple"],
    [8, "trained"],
    [11, "trained"],
    [12, "tactical"],
  ] as const)("Intelligence %i is %s (an off-by-one at either side of a boundary changes what the creature sees)", (int, tier) => {
    expect(cleverTier(int)).toBe(tier);
    expect(profile({ int }).tier).toBe(tier);
  });
});

describe("rule cover and rule targets follow the tier", () => {
  it.each([
    [3, "ignores", "nearest"],
    [7, "ignores", "nearest"],
    [8, "when_cheap", "most_wounded"],
    [11, "when_cheap", "most_wounded"],
    [12, "fights_from", "spellcasters_first"],
  ] as const)("Intelligence %i takes cover %s and targets %s", (int, cover, targets) => {
    const p = profile({ int });
    expect(p.cover).toBe(cover);
    expect(p.targets).toBe(targets);
  });

  it("lets an authored cover and an authored targets rule beat the derived ones, each on its own", () => {
    // Intelligence 12 would derive fights_from / spellcasters_first; each authored field replaces only its own.
    const coverOnly = profile({ int: 12, tactics: { cover: "ignores" } });
    expect(coverOnly.cover).toBe("ignores");
    expect(coverOnly.targets).toBe("spellcasters_first");
    const targetsOnly = profile({ int: 12, tactics: { targets: "lowest_armor" } });
    expect(targetsOnly.targets).toBe("lowest_armor");
    expect(targetsOnly.cover).toBe("fights_from");
  });
});

// A spell is offered wherever an attack is (#1021): a creature that has spells knows how to cast them, a boon (Bless) included.
describe("rule offers: what each tier is offered", () => {
  const kinds = (int: number) => [...profile({ int }).offers].sort();
  it("instinct (3) gets attack, spell, dash, move and flee, and nothing that takes thought", () => {
    expect(kinds(3)).toEqual(["attack", "boon", "dash", "flee", "heal", "move", "spell"]);
  });
  it("simple (4) adds dodge", () => {
    expect(kinds(4)).toEqual(["attack", "boon", "dash", "dodge", "flee", "heal", "move", "spell"]);
  });
  it("trained (8) adds disengage but not hide", () => {
    expect(kinds(8)).toEqual(["attack", "boon", "dash", "disengage", "dodge", "flee", "heal", "move", "spell"]);
    expect(kinds(7)).not.toContain("disengage");
  });
  it("tactical (12) adds hide", () => {
    expect(kinds(12)).toEqual(["attack", "boon", "dash", "disengage", "dodge", "flee", "heal", "hide", "move", "spell"]);
    expect(kinds(11)).not.toContain("hide");
  });
  it("offers a lurker of simple tier hide, but not a lurker of instinct tier", () => {
    const stealthy = { skills: { stealth: "+6" } };
    expect(profile({ int: 4, ...stealthy }).offers.has("hide")).toBe(true);
    expect(profile({ int: 3, ...stealthy }).offers.has("hide")).toBe(false);
    // The same creature without the skill is no lurker and does not get it.
    expect(profile({ int: 4 }).offers.has("hide")).toBe(false);
  });
  it("offers hide to an authored lurker too", () => {
    expect(profile({ int: 4, tactics: { role: "lurker" } }).offers.has("hide")).toBe(true);
  });
});

describe("rule role: derived in order, leader never", () => {
  it("is artillery when it has attacks and every one is ranged-only", () => {
    expect(profile({ actions: [attack("Bow", "ranged"), attack("Sling", "ranged")] }).role).toBe("artillery");
  });
  it("is not artillery when one attack is melee, or melee-or-ranged, or it has no attack", () => {
    expect(profile({ actions: [attack("Bow", "ranged"), attack("Dagger", "melee")] }).role).toBe("brute");
    expect(profile({ actions: [attack("Spear", "melee_or_ranged")] }).role).toBe("brute");
    expect(profile({ actions: [] }).role).toBe("brute");
  });
  it("is a controller with spellcasting, or a save-based action it can use at will, attacks or not", () => {
    expect(profile({ spellcasting: { entries: [] } }).role).toBe("controller");
    expect(profile({ actions: [saveEntry] }).role).toBe("controller");
    expect(profile({ actions: [attack("Rap", "melee"), attack("Claw", "melee"), saveEntry] }).role).toBe("controller");
  });
  it("is a controller for an at-will option that is a save", () => {
    const gaze: StatBlockEntry = { name: "Gaze", description: "", structured: { source: "manual", kind: "options", options: [{ name: "Fear", kind: "save" }] } };
    expect(profile({ actions: [gaze] }).role).toBe("controller");
  });
  it("a breath weapon on a recharge, or a save once a day, beside a bite does not make a controller (a hell hound, a dragon)", () => {
    // Bug it fails on: any single save entry deciding the role, which called every dragon in the library a controller.
    const breath: StatBlockEntry = { ...saveEntry, name: "Breath", structured: { ...saveEntry.structured, recharge: { min: 5, max: 6 } } };
    const daily: StatBlockEntry = { ...saveEntry, name: "Howl", structured: { ...saveEntry.structured, uses: { count: 1, per: "day" } } };
    expect(profile({ actions: [attack("Bite", "melee"), breath] }).role).toBe("brute");
    expect(profile({ actions: [attack("Bite", "melee"), daily] }).role).toBe("brute");
    // With nothing else to do, the limited save is still how it fights.
    expect(profile({ actions: [breath] }).role).toBe("controller");
  });
  it("is a lurker with a Stealth skill, whatever case it is spelled in", () => {
    expect(profile({ skills: { Stealth: "+5" } }).role).toBe("lurker");
    expect(profile({ skills: { perception: "+5" } }).role).toBe("brute");
  });
  it("is a skirmisher at 40 ft and not at 35", () => {
    expect(profile({ speed: "40 ft." }).role).toBe("skirmisher");
    expect(profile({ speed: "35 ft." }).role).toBe("brute");
    // A fly speed alone says nothing about how it walks.
    expect(profile({ speed: "30 ft., fly 60 ft." }).role).toBe("brute");
  });
  it("checks artillery before controller before lurker before skirmisher", () => {
    const all = { speed: "50 ft.", skills: { stealth: "+5" }, spellcasting: { entries: [] } };
    expect(profile({ ...all, actions: [attack("Bow", "ranged")] }).role).toBe("artillery");
    expect(profile({ ...all }).role).toBe("controller");
    expect(profile({ speed: "50 ft.", skills: { stealth: "+5" } }).role).toBe("lurker");
  });
  it("lets an authored role win, including leader which is never derived", () => {
    expect(profile({ speed: "50 ft.", tactics: { role: "leader" } }).role).toBe("leader");
    expect(profile({ actions: [attack("Bow", "ranged")], tactics: { role: "brute" } }).role).toBe("brute");
  });
});

describe("rule morale", () => {
  it.each(["undead", "construct", "ooze", "plant"] as const)("a %s never breaks", (type) => {
    expect(profile({}, type).morale).toEqual(morale(0, "fight_on"));
  });
  it("a beast breaks at a quarter and flees however dim it is: a rat does not fight to the death", () => {
    // Bug it fails on: Intelligence 2 or less reading as fearless for an animal (app convention, 16 Nov 2026).
    expect(profile({ int: 1 }, "beast").morale).toEqual(morale(0.25, "flee"));
    // A griffon (Intelligence 2) is an animal in all but name.
    expect(profile({ int: 2 }, "monstrosity").morale).toEqual(morale(0.25, "flee"));
  });
  it("a mindless thing that is not a beast never breaks, and Intelligence 3 is the first that does", () => {
    expect(profile({ int: 2 }, "aberration").morale).toEqual(morale(0, "fight_on"));
    expect(profile({ int: 3 }, "aberration").morale).toEqual(morale(0.25, "flee"));
  });
  it("everyone else breaks at a quarter and flees, and a creature with no type is judged by Intelligence alone", () => {
    expect(profile({}, "humanoid").morale).toEqual(morale(0.25, "flee"));
    expect(profile({ int: 10 }, null).morale).toEqual(morale(0.25, "flee"));
    expect(profile({ int: 2 }, null).morale).toEqual(morale(0, "fight_on"));
  });
  it("lets an authored morale beat even a fearless type", () => {
    expect(profile({ tactics: { morale: morale(0.5, "surrender") } }, "undead").morale).toEqual(morale(0.5, "surrender"));
  });
});

describe("rule pack-targets", () => {
  const pack = { special_abilities: [{ name: "Pack Tactics", description: "", structured: { source: "manual" as const, kind: "other" as const } }] };
  it("a dim pack hunter goes for the most wounded, not the nearest", () => {
    // Bug it fails on: targets read from Intelligence alone, so a wolf pack splits across whoever stands closest.
    expect(profile({ int: 3, ...pack }).targets).toBe("most_wounded");
    expect(profile({ int: 3 }).targets).toBe("nearest");
  });
  it("leaves a tactical pack hunter on spellcasters and an authored rule alone", () => {
    expect(profile({ int: 14, ...pack }).targets).toBe("spellcasters_first");
    expect(profile({ int: 3, ...pack, tactics: { targets: "nearest" } }).targets).toBe("nearest");
  });
});

describe("the note", () => {
  it("is carried through as written, and is null when absent", () => {
    expect(profile({ tactics: { note: "Fights to protect the eggs." } }).note).toBe("Fights to protect the eggs.");
    expect(profile().note).toBeNull();
  });
});
