import { describe, expect, it } from "vitest";
import type { ActionStructure, SaveStructure } from "../../types/statBlock.types.ts";
import { checkActionAgainstProse } from "./checkAction.ts";
import { parseActionProse } from "./parseAction.ts";
import { endsInProse, repeatSaveEdge } from "./parseEnds.ts";

const saveOf = (description: string, name = "Claw"): SaveStructure | undefined =>
  parseActionProse({ name, description }, { list: "actions", siblings: [] }).save;

const GHOUL =
  "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) slashing damage. If the target is a creature other than an elf or undead, it must succeed on a DC 10 Constitution saving throw or be paralyzed for 1 minute. The target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success.";

describe("reading what ends a save's conditions (#1050)", () => {
  it("reads a repeat save as save ends, over the minute it also states", () => {
    expect(saveOf(GHOUL)).toMatchObject({ ability: "con", dc: 10, conditions: ["Paralyzed"], ends: { kind: "save", at: "end" } });
  });

  describe("the repeat phrasings the library uses", () => {
    const base = (tail: string) =>
      `Each creature within 30 feet must succeed on a DC 15 Wisdom saving throw or be paralyzed for 1 minute. ${tail}`;
    it("reads the edge first, or no edge at all", () => {
      expect(saveOf(base("At the end of each of its turns, the target can repeat the saving throw, ending the effect."))?.ends).toEqual({ kind: "save", at: "end" });
      expect(saveOf(base("A paralyzed creature can repeat the saving throw, ending the effect on itself on a success."))?.ends).toEqual({ kind: "save", at: "end" });
      expect(saveOf(base("A paralyzed creature can repeat the saving throw on each of its turns, ending the effect on itself."))?.ends).toEqual({ kind: "save", at: "end" });
    });
    it("reads the gerund and Kobold Press re-save", () => {
      expect(
        saveOf("Each creature within 30 feet must succeed on a DC 15 Wisdom saving throw or be paralyzed for 1 minute, repeating the saving throw at the start of each of its turns, ending the effect on a success.")?.ends,
      ).toEqual({ kind: "save", at: "start" });
      expect(saveOf(base("A paralyzed creature can re-save at end of each of its turns success ends effect on itself."))?.ends).toEqual({ kind: "save", at: "end" });
    });
    it("leaves a repeat that waits for something else on the stated duration", () => {
      expect(saveOf(base("Each time it takes damage, the creature can repeat the saving throw, ending the effect on itself on a success."))?.ends).toEqual({ kind: "rounds", remaining: 10 });
    });
    it("takes the edge after the verb, not the damage's", () => {
      expect(
        saveOf("Constitution Saving Throw: DC 21. Failure: The target has the Poisoned condition. While Poisoned, it takes 21 (6d6) Poison damage at the start of each of its turns, and it repeats the save at the end of each of its turns, ending the effect on itself on a success.")?.ends,
      ).toEqual({ kind: "save", at: "end" });
    });
    it("gives a repeat that names one condition to no other", () => {
      const prose = "Each creature within 30 feet must succeed on a DC 12 Strength saving throw or be frightened and restrained for 1 minute. The creature can repeat the saving throw at the end of each of its turns, ending the restrained condition on itself on a success.";
      expect(saveOf(prose)?.ends).toBeUndefined();
      expect(saveOf(prose.replace("frightened and restrained", "restrained"))?.ends).toEqual({ kind: "save", at: "end" });
    });
  });

  it("reads the 2024 phrasing and a repeat at the start of the turn", () => {
    expect(
      saveOf(
        "Constitution Saving Throw: DC 12, one creature. Failure: The target has the Poisoned condition. The target repeats the save at the end of each of its turns, ending the effect on itself on a success.",
        "Venom",
      )?.ends,
    ).toEqual({ kind: "save", at: "end" });
    expect(
      saveOf(
        "Hit: 16 (2d10 + 5) piercing damage, and the target must succeed on a DC 16 Constitution saving throw or become poisoned for 4 rounds. While poisoned this way, the target must repeat the save at the start of its turn, ending the condition on itself on a success.",
        "Stinger",
      )?.ends,
    ).toEqual({ kind: "save", at: "start" });
  });

  it("gives a repeat of another save its own ability and DC", () => {
    expect(
      saveOf(
        "Each creature within 15 feet must make a DC 13 Dexterity saving throw. On a failure, a creature takes 14 (4d6) poison damage and is poisoned for 1 minute. On a success, a creature takes half the damage and isn't poisoned. A poisoned creature can make a DC 13 Constitution saving throw at the end of each of its turns, ending the effect on itself on a success.",
        "Flask",
      ),
    ).toBeUndefined(); // two saves in one entry: the parser leaves it to a person or an agent
    expect(
      saveOf(
        "The target must succeed on a DC 16 Constitution saving throw or be poisoned for 1 minute. A poisoned creature can repeat the Constitution saving throw at the end of each of its turns, ending the poisoned condition on itself on a success.",
        "Proboscis",
      )?.ends,
    ).toEqual({ kind: "save", at: "end" });
  });

  it("reads 'at end of' and 'the beginning of' as the edges they are", () => {
    expect(repeatSaveEdge("A blinded creature can make a DC 15 Con save at end of each of its turns ending effect on itself on a success")).toBe("end");
    expect(repeatSaveEdge("It can repeat the saving throw at the beginning of each of its turns, ending the effect on a success.")).toBe("start");
    expect(saveOf("The target must succeed on a DC 13 Wisdom saving throw or be frightened until the beginning of its next turn.", "Shriek")?.ends).toEqual({
      kind: "turn",
      at: "start",
      of: "self",
    });
  });

  it("reads an optional repeat, and a successful save that ends it, as save ends", () => {
    expect(repeatSaveEdge("The creature can repeat the saving throw at the end of each of its turns.")).toBe("end");
    expect(
      repeatSaveEdge("A paralyzed creature repeats the saving throw at the end of each of its turns; a successful save ends the paralysis."),
    ).toBe("end");
  });

  it("does not read a repeat that decides what happens next, or one not tied to a turn", () => {
    expect(
      repeatSaveEdge("The restrained creature must repeat the saving throw at the end of its next turn, becoming petrified on a failure or ending the effect on a success."),
    ).toBeNull();
    expect(repeatSaveEdge("A poisoned creature must repeat the saving throw at the end of each of its turns, taking 7 (2d6) poison damage on a failure.")).toBeNull();
    expect(repeatSaveEdge("The target repeats the saving throw each time it takes damage, ending the effect on itself on a success.")).toBeNull();
    expect(repeatSaveEdge("A creature can repeat the saving throw at the end of each hour, ending the effect on itself on a success.")).toBeNull();
  });

  it("gives a petrification ladder no end at all", () => {
    const save = saveOf(
      "Each creature in the cone must make a DC 13 Constitution saving throw. On a failed save, a creature begins to turn to stone and is restrained. The restrained creature must repeat the saving throw at the end of its next turn.",
      "Petrifying Breath",
    );
    expect(save?.conditions).toEqual(["Restrained"]);
    expect(save?.ends).toBeUndefined();
  });

  it("reads the bearer's next turn, and the source's by name", () => {
    expect(saveOf("The target must succeed on a DC 13 Wisdom saving throw or be frightened until the end of its next turn.", "Glare")?.ends).toEqual({
      kind: "turn",
      at: "end",
      of: "self",
    });
    expect(
      saveOf(
        "Each creature within 60 feet of the cloaker that can hear its moan must succeed on a DC 13 Wisdom saving throw or become frightened until the end of the cloaker's next turn.",
        "Moan",
      )?.ends,
    ).toEqual({ kind: "turn", at: "end", of: "source" });
    expect(
      saveOf("Each creature within 5 feet must succeed on a DC 16 Constitution saving throw or be blinded until the start of the creature's next turn.", "Dust")?.ends,
    ).toEqual({ kind: "turn", at: "start", of: "self" });
  });

  it("reads the terse phrasing and the shorthand save", () => {
    expect(saveOf("Each creature in the area: DC 19 Con save or be blinded until end of its next turn.", "Dust Burst")?.ends).toEqual({
      kind: "turn",
      at: "end",
      of: "self",
    });
    expect(
      saveOf("Each creature in the area: 10 (4d4) thunder and is incapacitated until end of its next turn (DC 13 Con half damage and isn't incapacitated).", "Burps")
        ?.ends,
    ).toEqual({ kind: "turn", at: "end", of: "self" });
  });

  it("counts minutes and rounds, and leaves hours to the DM", () => {
    expect(saveOf("The creature must succeed on a DC 15 Charisma saving throw or be charmed for 1 minute.", "Whispers")?.ends).toEqual({
      kind: "rounds",
      remaining: 10,
    });
    expect(saveOf("The target must succeed on a DC 16 Wisdom saving throw or be stunned for 1 round.", "Stare")?.ends).toEqual({
      kind: "rounds",
      remaining: 1,
    });
    expect(saveOf("Target: DC 13 Con save or be poisoned for 1 min.", "Sting")?.ends).toEqual({ kind: "rounds", remaining: 10 });
    expect(saveOf("The target must succeed on a DC 18 Wisdom saving throw or be charmed by the vampire for 24 hours.", "Charm")?.ends).toBeUndefined();
  });

  it("gives every condition the one duration they share, or none", () => {
    expect(
      saveOf("Hit: 20 (4d8 + 2) poison damage, and the target must succeed on a DC 15 Constitution saving throw or be poisoned and blinded until the end of its next turn.")
        ?.ends,
    ).toEqual({ kind: "turn", at: "end", of: "self" });
    // The minute further on is the charm's; the stun's 1d4 rounds is not a count the runner can hold.
    const mixed = saveOf(
      "Humanoids within 20 feet must make a successful DC 16 Wisdom saving throw or be stunned for 1d4 rounds and charmed by the mirager for 1 minute.",
      "Dance",
    );
    expect(mixed?.conditions).toContain("Stunned");
    expect(mixed?.ends).toBeUndefined();
    const prone = saveOf("The target must succeed on a DC 13 Constitution saving throw or be poisoned for 1 minute and knocked prone.", "Slam");
    expect(prone?.conditions).toEqual(expect.arrayContaining(["Poisoned", "Prone"]));
    expect(prone?.ends).toBeUndefined();
  });

  it("does not hand a condition a duration that belongs to something else", () => {
    expect(
      saveOf("The target must succeed on a DC 14 Wisdom saving throw or be incapacitated and have its speed reduced to 0 until the end of its next turn.", "Rattle")
        ?.ends,
    ).toBeUndefined();
  });

  it("leaves a save with no conditions without an end", () => {
    expect(
      saveOf("Each creature in that line must make a DC 13 Dexterity saving throw, taking 22 (4d10) fire damage on a failed save, or half as much damage on a successful one.", "Fire Breath")
        ?.ends,
    ).toBeUndefined();
  });
});

describe("the prose check holds an end to its words (#1050)", () => {
  const ghoul = { name: "Claws", description: GHOUL };
  const parsed = parseActionProse(ghoul, { list: "actions", siblings: [] });
  const withEnds = (ends: SaveStructure["ends"]): ActionStructure => ({ ...parsed, save: { ...parsed.save!, ends } });

  it("accepts the end the prose states", () => {
    expect(checkActionAgainstProse(ghoul, parsed, [])).toEqual({ ok: true });
  });

  it("rejects an end at the wrong edge, of another kind, or with nothing to end", () => {
    expect(checkActionAgainstProse(ghoul, withEnds({ kind: "save", at: "start" }), []).ok).toBe(false);
    expect(checkActionAgainstProse(ghoul, withEnds({ kind: "turn", at: "end", of: "self" }), []).ok).toBe(false);
    expect(checkActionAgainstProse(ghoul, withEnds({ kind: "rounds", remaining: 3 }), []).ok).toBe(false);
    expect(
      checkActionAgainstProse(ghoul, { ...parsed, save: { ...parsed.save!, conditions: [], ends: { kind: "save", at: "end" } } }, []).ok,
    ).toBe(false);
  });

  it("matches a duration by its fields, whatever their order, and refuses the runtime's armed flag", () => {
    const wis13 = { ability: "wis", dc: 13 } as const;
    const moan = "...must succeed on a DC 13 Wisdom saving throw or become frightened until the end of the cloaker's next turn.";
    expect(endsInProse({ of: "source", at: "end", kind: "turn" }, moan, wis13)).toBe(true);
    expect(endsInProse({ kind: "turn", at: "end", of: "self" }, moan, wis13)).toBe(false);
    expect(endsInProse({ kind: "turn", at: "end", of: "source", armed: true } as SaveStructure["ends"] & object, moan, wis13)).toBe(false);
    expect(endsInProse({ kind: "rounds", remaining: 10 }, "or be poisoned for 1 minute.", wis13)).toBe(true);
    expect(endsInProse({ kind: "rounds", remaining: 1 }, "or be poisoned for 1 minute.", wis13)).toBe(false);
  });

  it("holds another save's repeat to the ability and DC it names", () => {
    const dex15 = { ability: "dex", dc: 15 } as const;
    const stream =
      "Each creature in that line must make a DC 15 Dexterity saving throw. On a failed save, the target takes 21 (6d6) fire damage and is blinded for 1 minute. A blinded creature can make a DC 15 Constitution saving throw at the end of each of its turns, ending the effect on itself on a success.";
    expect(endsInProse({ kind: "save", at: "end", ability: "con", dc: 15 }, stream, dex15)).toBe(true);
    expect(endsInProse({ kind: "save", at: "end" }, stream, dex15)).toBe(false);
    expect(endsInProse({ kind: "save", at: "end", ability: "con", dc: 14 }, stream, dex15)).toBe(false);
    // The same save spelled out is the same save, bare or not.
    const ghoul = { ability: "con", dc: 10 } as const;
    expect(endsInProse({ kind: "save", at: "end" }, GHOUL, ghoul)).toBe(true);
    expect(endsInProse({ kind: "save", at: "end", ability: "con", dc: 10 }, GHOUL, ghoul)).toBe(true);
  });
});
