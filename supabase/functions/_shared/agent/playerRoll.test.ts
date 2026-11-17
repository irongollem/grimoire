import { describe, expect, it } from "vitest";
import {
  askOf,
  BONUS_MAX,
  BONUS_MIN,
  DC_MAX,
  DC_MIN,
  declinedText,
  parseAskRollInput,
  parsePendingRoll,
  parseRolled,
  parseRollAnswer,
  rollText,
  scoreRoll,
  type PendingRoll,
  type RollAnswer,
} from "./playerRoll";

const pending = (over: Partial<PendingRoll> = {}): PendingRoll => ({
  label: "Wisdom (Perception)",
  kind: "check",
  ability: "wis",
  skill: "perception",
  dc: 15,
  ...over,
});
const answer = (over: Partial<RollAnswer> = {}): RollAnswer => ({ faces: [11], mode: "normal", bonus: 4, atTable: false, ...over });

describe("parseAskRollInput", () => {
  it("names a skill check by its ability and skill, with the skill's usual ability when none is given", () => {
    // SRD 5.1 "Using Each Ability": Perception is a Wisdom skill.
    expect(parseAskRollInput({ kind: "check", skill: "perception", dc: 15 })).toEqual({ ok: true, value: pending() });
  });

  it("keeps an ability the narrator pairs a skill with, so Strength (Intimidation) is not turned into Charisma", () => {
    // SRD 5.1 "Variant: Skills with Different Abilities".
    const parsed = parseAskRollInput({ kind: "check", skill: "intimidation", ability: "str", dc: 12 });
    expect(parsed).toEqual({ ok: true, value: { label: "Strength (Intimidation)", kind: "check", ability: "str", skill: "intimidation", dc: 12 } });
  });

  it("names a save by its ability and refuses one with a skill or without an ability", () => {
    expect(parseAskRollInput({ kind: "save", ability: "dex", dc: 13 })).toEqual({
      ok: true,
      value: { label: "Dexterity saving throw", kind: "save", ability: "dex", skill: null, dc: 13 },
    });
    expect(parseAskRollInput({ kind: "save", ability: "dex", skill: "acrobatics", dc: 13 }).ok).toBe(false);
    expect(parseAskRollInput({ kind: "save", dc: 13 }).ok).toBe(false);
  });

  it("refuses a check that names neither an ability nor a skill, instead of asking the player for nothing", () => {
    expect(parseAskRollInput({ kind: "check", dc: 10 }).ok).toBe(false);
  });

  it.each([DC_MIN - 1, DC_MAX + 1, 12.5, "15"])("refuses the DC %s", (dc) => {
    expect(parseAskRollInput({ kind: "check", ability: "str", dc }).ok).toBe(false);
  });

  it("accepts the DC at both ends of its range", () => {
    expect(parseAskRollInput({ kind: "check", ability: "str", dc: DC_MIN }).ok).toBe(true);
    expect(parseAskRollInput({ kind: "check", ability: "str", dc: DC_MAX }).ok).toBe(true);
  });

  it("refuses a skill or an ability it does not know, so a made-up one never reaches the page", () => {
    expect(parseAskRollInput({ kind: "check", skill: "lockpicking", dc: 10 }).ok).toBe(false);
    expect(parseAskRollInput({ kind: "check", ability: "luck", dc: 10 }).ok).toBe(false);
    // A property every object inherits is not a skill.
    expect(parseAskRollInput({ kind: "check", skill: "toString", dc: 10 }).ok).toBe(false);
  });

  it("builds the label itself, so text the model adds cannot put the DC on the page", () => {
    const parsed = parseAskRollInput({ kind: "check", skill: "stealth", dc: 17, label: "Stealth DC 17" });
    expect(parsed.ok && parsed.value.label).toBe("Dexterity (Stealth)");
  });
});

describe("askOf", () => {
  it("leaves the DC out of what the page is told", () => {
    expect(askOf(pending({ dc: 23 }))).toEqual({ label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception" });
  });
});

describe("parsePendingRoll", () => {
  it("reads back what was stored", () => {
    expect(parsePendingRoll({ ...pending() })).toEqual(pending());
  });

  it.each([
    ["no DC", { ...pending(), dc: undefined }],
    ["a DC out of range", { ...pending(), dc: 99 }],
    ["an unknown ability", { ...pending(), ability: "luck" }],
    ["an empty label", { ...pending(), label: "" }],
    ["an unknown skill", { ...pending(), skill: "lockpicking" }],
    ["an array", [pending()]],
  ])("treats a stored roll with %s as nothing asked, instead of scoring against it", (_what, raw) => {
    expect(parsePendingRoll(raw)).toBeNull();
  });
});

describe("parseRollAnswer", () => {
  it("takes one face for a normal roll and refuses two, so a second die cannot be slipped in to pick from", () => {
    expect(parseRollAnswer(answer())).toEqual(answer());
    expect(parseRollAnswer(answer({ faces: [3, 20] }))).toBeNull();
  });

  it("takes two faces for advantage rolled on screen and refuses one, or the page could keep a lone high die", () => {
    expect(parseRollAnswer(answer({ mode: "advantage", faces: [3, 17] }))).toEqual(answer({ mode: "advantage", faces: [3, 17] }));
    expect(parseRollAnswer(answer({ mode: "advantage", faces: [17] }))).toBeNull();
  });

  it("takes the one face a player typed after rolling with disadvantage at the table", () => {
    const typed = answer({ mode: "disadvantage", faces: [6], atTable: true });
    expect(parseRollAnswer(typed)).toEqual(typed);
    expect(parseRollAnswer({ ...typed, faces: [6, 9] })).toBeNull();
  });

  it.each([0, 21, 10.5, "12"])("refuses the face %s", (face) => {
    expect(parseRollAnswer({ ...answer(), faces: [face] })).toBeNull();
  });

  it("accepts a 1 and a 20", () => {
    expect(parseRollAnswer(answer({ faces: [1] }))).not.toBeNull();
    expect(parseRollAnswer(answer({ faces: [20] }))).not.toBeNull();
  });

  it("refuses a bonus outside what any sheet reaches, so a typed bonus cannot decide the roll by itself", () => {
    expect(parseRollAnswer(answer({ bonus: BONUS_MAX + 1 }))).toBeNull();
    expect(parseRollAnswer(answer({ bonus: BONUS_MIN - 1 }))).toBeNull();
    expect(parseRollAnswer(answer({ bonus: BONUS_MAX }))).not.toBeNull();
    expect(parseRollAnswer(answer({ bonus: 2.5 }))).toBeNull();
  });

  it("refuses a mode it does not know and a missing atTable", () => {
    expect(parseRollAnswer({ ...answer(), mode: "lucky" })).toBeNull();
    expect(parseRollAnswer({ faces: [11], mode: "normal", bonus: 4 })).toBeNull();
  });
});

describe("scoreRoll", () => {
  it("succeeds when the total equals the DC and fails one under", () => {
    // SRD 5.1 "Ability Checks": "If the total equals or exceeds the DC, the ability check is a success."
    expect(scoreRoll(pending({ dc: 15 }), answer({ faces: [11], bonus: 4 })).success).toBe(true);
    expect(scoreRoll(pending({ dc: 15 }), answer({ faces: [10], bonus: 4 })).success).toBe(false);
  });

  it("keeps the higher die with advantage and the lower with disadvantage", () => {
    // SRD 5.1 "Advantage and Disadvantage".
    expect(scoreRoll(pending(), answer({ mode: "advantage", faces: [5, 17] })).rolled).toMatchObject({ kept: 17, total: 21 });
    expect(scoreRoll(pending(), answer({ mode: "disadvantage", faces: [5, 17] })).rolled).toMatchObject({ kept: 5, total: 9 });
  });

  it("lets a natural 20 fail and a natural 1 succeed, because that rule belongs to attack rolls", () => {
    // SRD 5.1 "Attack Rolls" ("Rolling 1 or 20") is the only place a natural roll decides; a check goes by its total.
    expect(scoreRoll(pending({ dc: 30 }), answer({ faces: [20], bonus: 4 })).success).toBe(false);
    expect(scoreRoll(pending({ dc: 5 }), answer({ faces: [1], bonus: 4 })).success).toBe(true);
  });

  it("subtracts a negative bonus", () => {
    expect(scoreRoll(pending({ dc: 10 }), answer({ faces: [10], bonus: -1 }))).toMatchObject({ rolled: { total: 9 }, success: false });
  });

  it("carries no outcome and no DC in what is shown and stored", () => {
    const shown = JSON.stringify(scoreRoll(pending({ dc: 23 }), answer()).rolled);
    expect(shown).not.toContain("23");
    expect(shown).not.toContain("success");
  });
});

describe("what the narrator reads", () => {
  it("tells the narrator the outcome it must narrate, which the page is never told", () => {
    const won = rollText(pending({ dc: 15 }), scoreRoll(pending({ dc: 15 }), answer({ faces: [11], bonus: 4 })));
    expect(won).toContain("d20 (11) + 4 = 15 against DC 15");
    expect(won).toContain("succeeds");
    const lost = rollText(pending({ dc: 15 }), scoreRoll(pending({ dc: 15 }), answer({ faces: [3], bonus: -1 })));
    expect(lost).toContain("d20 (3) - 1 = 2");
    expect(lost).toContain("fails");
  });

  it("says which roll was dropped when the player sent something else", () => {
    expect(declinedText(pending())).toContain("Wisdom (Perception)");
  });
});

describe("parseRolled", () => {
  const stored = { label: "Wisdom (Perception)", faces: [5, 17], kept: 17, bonus: 4, total: 21, mode: "advantage", atTable: false };

  it("reads back a roll as it was stored", () => {
    expect(parseRolled(stored)).toEqual(stored);
  });

  it.each([
    ["a total that is not the die plus the bonus", { ...stored, total: 25 }],
    ["a kept die that was never rolled", { ...stored, kept: 20, total: 24 }],
    ["three dice", { ...stored, faces: [5, 17, 20] }],
    ["no dice", { ...stored, faces: [] }],
    ["a die of 21", { ...stored, faces: [5, 21], kept: 21, total: 25 }],
    ["an unknown mode", { ...stored, mode: "lucky" }],
    ["no label", { ...stored, label: "" }],
  ])("drops a stored roll with %s, so a tampered row is never drawn as a roll", (_what, raw) => {
    expect(parseRolled(raw)).toBeNull();
  });
});
