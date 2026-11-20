import { describe, expect, it } from "vitest";
import { healNeedOf } from "./healNeed";

const body = (over: Record<string, unknown>) => ({ hp: 10, max_hp: 20, type: "monster" as const, death_saves: { successes: 0, failures: 0 }, ...over });
const character = (over: Record<string, unknown> = {}) => body({ type: "player", party_member_id: "pm-1", ...over });

describe("healNeedOf", () => {
  // PHB 2014 ch. 9 "Death Saving Throws": a character at 0 is dying, not dead, and healing stands them up.
  it("fails if a character at 0 hit points is not down, or one with three failed saves is not dead", () => {
    expect(healNeedOf(character({ hp: 0 }))).toBe("down");
    expect(healNeedOf(character({ hp: 0, death_saves: { successes: 0, failures: 3 } }))).toBeNull();
  });

  // A monster, an NPC or a companion at 0 is dead here (`takesTurnsInFight`): a heal is never aimed at a corpse.
  it("fails if a monster at 0 hit points is a heal's target", () => {
    expect(healNeedOf(body({ hp: 0 }))).toBeNull();
    expect(healNeedOf(body({ hp: 0, type: "player" }))).toBeNull();
  });

  // Below half is the line a Second Wind is saved for: 9 of 20 is low, exactly half (10 of 20) is only hurt.
  // Bug caught: half itself counted as low, so a creature at 10 of 20 was healed before an attack.
  it("fails if exactly half is low, or a creature at full hit points needs healing", () => {
    expect(healNeedOf(body({ hp: 9 }))).toBe("low");
    expect(healNeedOf(body({ hp: 10 }))).toBe("hurt");
    expect(healNeedOf(body({ hp: 20 }))).toBeNull();
  });
});
