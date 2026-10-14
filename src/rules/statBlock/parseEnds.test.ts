import { describe, expect, it } from "vitest";
import type { ActionStructure, SaveCondition, SaveEnds, SaveStructure } from "../../types/statBlock.types.ts";
import { checkActionAgainstProse } from "./checkAction.ts";
import { parseActionProse } from "./parseAction.ts";
import { endsInProse, repeatSaveEdge } from "./parseEnds.ts";

const saveOf = (description: string, name = "Claw"): SaveStructure | undefined =>
  parseActionProse({ name, description }, { list: "actions", siblings: [] }).save;
/** The end of the save's first condition. */
const firstEnd = (save: SaveStructure | undefined) => save?.conditions[0]?.ends;
/** The ends of every condition, by name. */
const endsByName = (save: SaveStructure | undefined) => save?.conditions.map((c) => [c.name, c.ends]);

const GHOUL =
  "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) slashing damage. If the target is a creature other than an elf or undead, it must succeed on a DC 10 Constitution saving throw or be paralyzed for 1 minute. The target can repeat the saving throw at the end of each of its turns, ending the effect on itself on a success.";

describe("reading what ends a save's conditions (#1050)", () => {
  it("reads a repeat save as save ends, over the minute it also states", () => {
    expect(saveOf(GHOUL)).toMatchObject({
      ability: "con",
      dc: 10,
      conditions: [{ name: "Paralyzed", ends: { kind: "save", at: "end", remaining: 10 } }],
    });
  });

  describe("the repeat phrasings the library uses", () => {
    const base = (tail: string) =>
      `Each creature within 30 feet must succeed on a DC 15 Wisdom saving throw or be paralyzed for 1 minute. ${tail}`;
    it("reads the edge first, or no edge at all", () => {
      expect(firstEnd(saveOf(base("At the end of each of its turns, the target can repeat the saving throw, ending the effect.")))).toEqual({ kind: "save", at: "end", remaining: 10 });
      expect(firstEnd(saveOf(base("A paralyzed creature can repeat the saving throw, ending the effect on itself on a success.")))).toEqual({ kind: "save", at: "end", remaining: 10 });
      expect(firstEnd(saveOf(base("A paralyzed creature can repeat the saving throw on each of its turns, ending the effect on itself.")))).toEqual({ kind: "save", at: "end", remaining: 10 });
    });
    it("reads the gerund and Kobold Press re-save", () => {
      expect(
        firstEnd(saveOf("Each creature within 30 feet must succeed on a DC 15 Wisdom saving throw or be paralyzed for 1 minute, repeating the saving throw at the start of each of its turns, ending the effect on a success.")),
      ).toEqual({ kind: "save", at: "start", remaining: 10 });
      expect(firstEnd(saveOf(base("A paralyzed creature can re-save at end of each of its turns success ends effect on itself.")))).toEqual({ kind: "save", at: "end", remaining: 10 });
    });
    it("leaves a repeat that waits for something else on the stated duration", () => {
      expect(firstEnd(saveOf(base("Each time it takes damage, the creature can repeat the saving throw, ending the effect on itself on a success.")))).toEqual({ kind: "rounds", remaining: 10 });
    });
    it("takes the edge after the verb, not the damage's", () => {
      expect(
        firstEnd(saveOf("Constitution Saving Throw: DC 21. Failure: The target has the Poisoned condition. While Poisoned, it takes 21 (6d6) Poison damage at the start of each of its turns, and it repeats the save at the end of each of its turns, ending the effect on itself on a success.")),
      ).toEqual({ kind: "save", at: "end" });
    });
    it("gives a repeat that names one condition to no other", () => {
      const prose = "Each creature within 30 feet must succeed on a DC 12 Strength saving throw or be frightened and restrained for 1 minute. The creature can repeat the saving throw at the end of each of its turns, ending the restrained condition on itself on a success.";
      expect(endsByName(saveOf(prose))).toEqual([
        ["Frightened", { kind: "rounds", remaining: 10 }],
        ["Restrained", { kind: "save", at: "end", remaining: 10 }],
      ]);
      expect(firstEnd(saveOf(prose.replace("frightened and restrained", "restrained")))).toEqual({ kind: "save", at: "end", remaining: 10 });
    });
    it("gives a repeat that names one condition to no other, the Alp (#1055)", () => {
      const alp =
        "Each creature within 30 feet must succeed on a DC 12 Strength saving throw or be frightened and restrained for 1 minute. The creature can repeat the saving throw at the end of each of its turns, ending the restrained condition on itself on a success. The creature must succeed on another saving throw on a following round to end the frightened condition.";
      expect(saveOf(alp)?.conditions).toEqual([
        { name: "Frightened", ends: { kind: "rounds", remaining: 10 } },
        { name: "Restrained", ends: { kind: "save", at: "end", remaining: 10 } },
      ]);
    });
    it("caps a save end only by rounds, never by a turn duration", () => {
      expect(
        firstEnd(saveOf("The target must succeed on a DC 13 Wisdom saving throw or be frightened until the end of its next turn. It can repeat the saving throw at the end of each of its turns, ending the effect on itself.")),
      ).toEqual({ kind: "save", at: "end" });
    });
  });

  it("reads the 2024 phrasing and a repeat at the start of the turn", () => {
    expect(
      firstEnd(saveOf(
        "Constitution Saving Throw: DC 12, one creature. Failure: The target has the Poisoned condition. The target repeats the save at the end of each of its turns, ending the effect on itself on a success.",
        "Venom",
      )),
    ).toEqual({ kind: "save", at: "end" });
    expect(
      firstEnd(saveOf(
        "Hit: 16 (2d10 + 5) piercing damage, and the target must succeed on a DC 16 Constitution saving throw or become poisoned for 4 rounds. While poisoned this way, the target must repeat the save at the start of its turn, ending the condition on itself on a success.",
        "Stinger",
      )),
    ).toEqual({ kind: "save", at: "start", remaining: 4 });
  });

  it("gives a repeat of another save its own ability and DC", () => {
    expect(
      saveOf(
        "Each creature within 15 feet must make a DC 13 Dexterity saving throw. On a failure, a creature takes 14 (4d6) poison damage and is poisoned for 1 minute. On a success, a creature takes half the damage and isn't poisoned. A poisoned creature can make a DC 13 Constitution saving throw at the end of each of its turns, ending the effect on itself on a success.",
        "Flask",
      ),
    ).toBeUndefined(); // two saves in one entry: the parser leaves it to a person or an agent
    expect(
      firstEnd(saveOf(
        "The target must succeed on a DC 16 Constitution saving throw or be poisoned for 1 minute. A poisoned creature can repeat the Constitution saving throw at the end of each of its turns, ending the poisoned condition on itself on a success.",
        "Proboscis",
      )),
    ).toEqual({ kind: "save", at: "end", remaining: 10 });
  });

  it("reads 'at end of' and 'the beginning of' as the edges they are", () => {
    expect(repeatSaveEdge("A blinded creature can make a DC 15 Con save at end of each of its turns ending effect on itself on a success")).toBe("end");
    expect(repeatSaveEdge("It can repeat the saving throw at the beginning of each of its turns, ending the effect on a success.")).toBe("start");
    expect(firstEnd(saveOf("The target must succeed on a DC 13 Wisdom saving throw or be frightened until the beginning of its next turn.", "Shriek"))).toEqual({
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
    expect(save?.conditions).toEqual([{ name: "Restrained" }]);
  });

  it("reads the bearer's next turn, and the source's by name", () => {
    expect(firstEnd(saveOf("The target must succeed on a DC 13 Wisdom saving throw or be frightened until the end of its next turn.", "Glare"))).toEqual({
      kind: "turn",
      at: "end",
      of: "self",
    });
    expect(
      firstEnd(saveOf(
        "Each creature within 60 feet of the cloaker that can hear its moan must succeed on a DC 13 Wisdom saving throw or become frightened until the end of the cloaker's next turn.",
        "Moan",
      )),
    ).toEqual({ kind: "turn", at: "end", of: "source" });
    expect(
      firstEnd(saveOf("Each creature within 5 feet must succeed on a DC 16 Constitution saving throw or be blinded until the start of the creature's next turn.", "Dust")),
    ).toEqual({ kind: "turn", at: "start", of: "self" });
  });

  it("reads the terse phrasing and the shorthand save", () => {
    expect(firstEnd(saveOf("Each creature in the area: DC 19 Con save or be blinded until end of its next turn.", "Dust Burst"))).toEqual({
      kind: "turn",
      at: "end",
      of: "self",
    });
    expect(
      firstEnd(saveOf("Each creature in the area: 10 (4d4) thunder and is incapacitated until end of its next turn (DC 13 Con half damage and isn't incapacitated).", "Burps")),
    ).toEqual({ kind: "turn", at: "end", of: "self" });
  });

  it("counts minutes and rounds, and leaves hours to the DM", () => {
    expect(firstEnd(saveOf("The creature must succeed on a DC 15 Charisma saving throw or be charmed for 1 minute.", "Whispers"))).toEqual({
      kind: "rounds",
      remaining: 10,
    });
    expect(firstEnd(saveOf("The target must succeed on a DC 16 Wisdom saving throw or be stunned for 1 round.", "Stare"))).toEqual({
      kind: "rounds",
      remaining: 1,
    });
    expect(firstEnd(saveOf("Target: DC 13 Con save or be poisoned for 1 min.", "Sting"))).toEqual({ kind: "rounds", remaining: 10 });
    expect(firstEnd(saveOf("The target must succeed on a DC 18 Wisdom saving throw or be charmed by the vampire for 24 hours.", "Charm"))).toBeUndefined();
  });

  it("reads a count with no 'for' straight after the condition, and caps a repeat with it", () => {
    const rattleback =
      "Melee Weapon Attack: +8 to hit, 5 ft., one target, 14 (2d8+5) piercing damage + 7 (2d6) poison. Target: DC 15 Con save or poisoned 1 min. While poisoned this way target can't regain hp. Target can re-save at end of each of its turns success ends effect on itself.";
    expect(saveOf(rattleback, "Bite")?.conditions).toEqual([{ name: "Poisoned", ends: { kind: "save", at: "end", remaining: 10 } }]);
    expect(saveOf("Target: DC 13 Wis save or frightened 2 rounds.", "Glare")?.conditions).toEqual([
      { name: "Frightened", ends: { kind: "rounds", remaining: 2 } },
    ]);
    // A bare hour is still left to the DM, and a count elsewhere in the prose is no condition's.
    expect(firstEnd(saveOf("Target: DC 13 Con save or poisoned 1 hour.", "Sting"))).toBeUndefined();
    expect(firstEnd(saveOf("Within 1 minute of eating, target: DC 13 Con save or poisoned.", "Sting"))).toBeUndefined();
  });

  it("holds a terse count to the condition it follows in the prose check", () => {
    const con15 = { ability: "con", dc: 15 } as const;
    const terse = "Target: DC 15 Con save or poisoned 1 min. Target can re-save at end of each of its turns success ends effect on itself.";
    expect(endsInProse({ kind: "save", at: "end", remaining: 10 }, terse, con15, "Poisoned")).toBe(true);
    expect(endsInProse({ kind: "rounds", remaining: 10 }, terse, con15, "Poisoned")).toBe(true);
    expect(endsInProse({ kind: "rounds", remaining: 10 }, "Within 1 minute, target: DC 15 Con save or poisoned.", con15, "Poisoned")).toBe(false);
  });

  it("gives each condition its own duration", () => {
    expect(
      firstEnd(saveOf("Hit: 20 (4d8 + 2) poison damage, and the target must succeed on a DC 15 Constitution saving throw or be poisoned and blinded until the end of its next turn.")),
    ).toEqual({ kind: "turn", at: "end", of: "self" });
    // The minute further on is the charm's; the stun's 1d4 rounds is not a count the runner can hold.
    const mixed = saveOf(
      "Humanoids within 20 feet must make a successful DC 16 Wisdom saving throw or be stunned for 1d4 rounds and charmed by the mirager for 1 minute.",
      "Dance",
    );
    expect(mixed?.conditions).toEqual([{ name: "Charmed", ends: { kind: "rounds", remaining: 10 } }, { name: "Stunned" }]);
    const prone = saveOf("The target must succeed on a DC 13 Constitution saving throw or be poisoned for 1 minute and knocked prone.", "Slam");
    expect(endsByName(prone)).toEqual([
      ["Poisoned", { kind: "rounds", remaining: 10 }],
      ["Prone", undefined],
    ]);
  });

  it("does not hand a condition a duration that belongs to something else", () => {
    expect(
      firstEnd(saveOf("The target must succeed on a DC 14 Wisdom saving throw or be incapacitated and have its speed reduced to 0 until the end of its next turn.", "Rattle")),
    ).toBeUndefined();
  });

  it("leaves a save with no conditions without an end", () => {
    expect(
      firstEnd(saveOf("Each creature in that line must make a DC 13 Dexterity saving throw, taking 22 (4d10) fire damage on a failed save, or half as much damage on a successful one.", "Fire Breath")),
    ).toBeUndefined();
  });
});

describe("the prose check holds an end to its words (#1050)", () => {
  const ghoul = { name: "Claws", description: GHOUL };
  const parsed = parseActionProse(ghoul, { list: "actions", siblings: [] });
  const withEnds = (ends: SaveCondition["ends"]): ActionStructure => ({
    ...parsed,
    save: { ...parsed.save!, conditions: [{ name: "Paralyzed", ...(ends ? { ends } : {}) }] },
  });
  const CAP = { kind: "save", at: "end", remaining: 10 } as const;

  it("accepts the end the prose states", () => {
    expect(checkActionAgainstProse(ghoul, parsed, [])).toEqual({ ok: true });
    expect(checkActionAgainstProse(ghoul, withEnds(CAP), [])).toEqual({ ok: true });
  });

  it("holds a remaining cap to a rounds duration in the prose, and counts it as a key", () => {
    expect(checkActionAgainstProse(ghoul, withEnds({ ...CAP, remaining: 5 }), []).ok).toBe(false);
    expect(checkActionAgainstProse(ghoul, withEnds({ ...CAP, extra: 1 } as SaveEnds), []).ok).toBe(false);
    expect(checkActionAgainstProse(ghoul, withEnds({ remaining: 10, at: "end", kind: "save" }), []).ok).toBe(true);
  });

  it("holds a named repeat to the condition it names, and refuses a condition twice", () => {
    const alp = {
      name: "Alp",
      description:
        "Each creature within 30 feet must succeed on a DC 12 Strength saving throw or be frightened and restrained for 1 minute. The creature can repeat the saving throw at the end of each of its turns, ending the restrained condition on itself on a success.",
    };
    const ok = parseActionProse(alp, { list: "actions", siblings: [] });
    expect(checkActionAgainstProse(alp, ok, [])).toEqual({ ok: true });
    const swapped = {
      ...ok,
      save: { ...ok.save!, conditions: [{ name: "Frightened" as const, ends: CAP }, { name: "Restrained" as const }] },
    };
    expect(checkActionAgainstProse(alp, swapped, []).ok).toBe(false);
    const twice = { ...ok, save: { ...ok.save!, conditions: [{ name: "Restrained" as const }, { name: "Restrained" as const }] } };
    expect(checkActionAgainstProse(alp, twice, []).ok).toBe(false);
  });

  it("rejects an end at the wrong edge, of another kind, or on a condition the prose lacks", () => {
    expect(checkActionAgainstProse(ghoul, withEnds({ kind: "save", at: "start" }), []).ok).toBe(false);
    expect(checkActionAgainstProse(ghoul, withEnds({ kind: "turn", at: "end", of: "self" }), []).ok).toBe(false);
    expect(checkActionAgainstProse(ghoul, withEnds({ kind: "rounds", remaining: 3 }), []).ok).toBe(false);
    expect(
      checkActionAgainstProse(ghoul, { ...parsed, save: { ...parsed.save!, conditions: [{ name: "Charmed", ends: CAP }] } }, []).ok,
    ).toBe(false);
  });

  it("matches a duration by its fields, whatever their order, and refuses the runtime's armed flag", () => {
    const wis13 = { ability: "wis", dc: 13 } as const;
    const moan = "...must succeed on a DC 13 Wisdom saving throw or become frightened until the end of the cloaker's next turn.";
    expect(endsInProse({ of: "source", at: "end", kind: "turn" }, moan, wis13, "Frightened")).toBe(true);
    expect(endsInProse({ kind: "turn", at: "end", of: "self" }, moan, wis13, "Frightened")).toBe(false);
    expect(endsInProse({ kind: "turn", at: "end", of: "source", armed: true } as SaveEnds, moan, wis13, "Frightened")).toBe(false);
    expect(endsInProse({ kind: "rounds", remaining: 10 }, "or be poisoned for 1 minute.", wis13, "Poisoned")).toBe(true);
    expect(endsInProse({ kind: "rounds", remaining: 1 }, "or be poisoned for 1 minute.", wis13, "Poisoned")).toBe(false);
  });

  it("holds another save's repeat to the ability and DC it names", () => {
    const dex15 = { ability: "dex", dc: 15 } as const;
    const stream =
      "Each creature in that line must make a DC 15 Dexterity saving throw. On a failed save, the target takes 21 (6d6) fire damage and is blinded for 1 minute. A blinded creature can make a DC 15 Constitution saving throw at the end of each of its turns, ending the effect on itself on a success.";
    expect(endsInProse({ kind: "save", at: "end", ability: "con", dc: 15 }, stream, dex15, "Blinded")).toBe(true);
    expect(endsInProse({ kind: "save", at: "end" }, stream, dex15, "Blinded")).toBe(false);
    expect(endsInProse({ kind: "save", at: "end", ability: "con", dc: 14 }, stream, dex15, "Blinded")).toBe(false);
    // The same save spelled out is the same save, bare or not.
    const ghoul = { ability: "con", dc: 10 } as const;
    expect(endsInProse({ kind: "save", at: "end" }, GHOUL, ghoul, "Paralyzed")).toBe(true);
    expect(endsInProse({ kind: "save", at: "end", ability: "con", dc: 10 }, GHOUL, ghoul, "Paralyzed")).toBe(true);
  });
});
