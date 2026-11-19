import { describe, expect, it } from "vitest";
import type { RunCombatant } from "../../../types/encounter.types.ts";
import { areaFeetOf, castableNow, listedSpellNames } from "./castNow.ts";
import { fireball, fireBolt, mageBlock } from "./spellTestKit.ts";

const mage = (over: Partial<RunCombatant> = {}): RunCombatant => ({
  instance_id: "mage", type: "monster", name: "Mage", faction_id: "m", initiative: null, hp: 40, max_hp: 40, ac: "12", conditions: [], curses: [],
  death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 0, y: 0 }, size: "medium", ...over,
});
const used = (key: string, n: number, perDay: number) => ({ action_uses: { [key]: { used: n, per_day: perDay } } });
const names = (items: { spell: string; castLevel: number }[]) => items.map((i) => `${i.spell}@${i.castLevel}`);

describe("listedSpellNames", () => {
  it("lists every spell the stat block prints once, and nothing for a creature with no Spellcasting entry", () => {
    expect(listedSpellNames(mageBlock())).toEqual(["fire bolt", "light", "magic missile", "shield", "counterspell", "fireball", "ice storm"]);
    expect(listedSpellNames(mageBlock({ special_abilities: [] }))).toEqual([]);
  });
});

describe("areaFeetOf", () => {
  it("reads the first number of the size and nothing else", () => {
    expect(areaFeetOf("20 feet")).toBe(20);
    expect(areaFeetOf("20 ft. radius")).toBe(20);
    expect(areaFeetOf("15-foot cube")).toBe(15);
    expect(areaFeetOf("sphere")).toBeNull();
    expect(areaFeetOf(null)).toBeNull();
  });
});

describe("castableNow", () => {
  // SRD 5.1 mage: Fire Bolt at will (a cantrip), "3rd level (3 slots): fireball". Only the two records are on hand, so the
  // other listed spells have nothing to roll and are absent.
  // Bug caught: a listed spell with no record is offered, or the slot level / area of Fireball is read wrong.
  it("offers the cantrip with no tally and Fireball at its own level with the area of its record", () => {
    const now = castableNow(mageBlock(), mage(), [fireball(), fireBolt()], "2014");
    expect(names(now)).toEqual(["Fire Bolt@0", "Fireball@3"]);
    expect(now[0]).toMatchObject({ useKey: null, limit: null, kind: "attack", area: null });
    expect(now[1]).toMatchObject({ useKey: "slots/3", limit: { per_day: 3 }, kind: "save", area: { shape: "sphere", feet: 20 } });
  });

  // SRD 5.1 "Spellcasting": a spell is cast with a slot of its level or higher. All three 3rd-level slots are spent, the 4th are whole:
  // Fireball is offered at 4th level and tallied under slots/4, never at 3rd.
  // Bug caught: a spent level is still offered, or the upcast is tallied under the spell's own level.
  it("offers the next higher level with a slot when its own is spent, and nothing when every one is", () => {
    const spent3 = mage(used("slots/3", 3, 3));
    const up = castableNow(mageBlock(), spent3, [fireball()], "2014");
    expect(names(up)).toEqual(["Fireball@4"]);
    expect(up[0]).toMatchObject({ useKey: "slots/4", limit: { per_day: 3 } });
    // 3rd spent and 4th spent: 5th and up the mage has none.
    const spentAll = mage({ action_uses: { "slots/3": { used: 3, per_day: 3 }, "slots/4": { used: 3, per_day: 3 } } });
    expect(castableNow(mageBlock(), spentAll, [fireball(), fireBolt()], "2014").map((i) => i.spell)).toEqual(["Fire Bolt"]);
  });

  // Bug caught: an unreviewed library record is rolled (nothing proves its numbers), or a record with no automatable entry is offered.
  it("leaves out a record that is not reviewed, one that heals, and one with no record at all", () => {
    expect(castableNow(mageBlock(), mage(), [fireball({ mechanics_reviewed: false })], "2014")).toEqual([]);
    expect(castableNow(mageBlock(), mage(), [fireball({ attack_type: "automatic" })], "2014")).toEqual([]);
    expect(castableNow(mageBlock(), mage(), [], "2014")).toEqual([]);
  });

  // Bug caught: a shape with a size nobody can read is made up as an area (the cast then catches creatures it should not).
  it("treats a shape with an unreadable size as no area, and a record with no shape as none", () => {
    expect(castableNow(mageBlock(), mage(), [fireball({ aoe_size: "a big ball" })], "2014")[0].area).toBeNull();
    expect(castableNow(mageBlock(), mage(), [fireball({ aoe_shape: null })], "2014")[0].area).toBeNull();
  });

  it("offers nothing to a creature with no Spellcasting entry", () => {
    expect(castableNow(mageBlock({ special_abilities: [] }), mage(), [fireball(), fireBolt()], "2014")).toEqual([]);
  });
});
