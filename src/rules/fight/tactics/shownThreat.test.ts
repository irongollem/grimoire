import { describe, expect, it } from "vitest";
import type { RunCombatant, ShownDeeds } from "../../../types/encounter.types.ts";
import { addDeeds, isShownDeedDelta, seenAs, seenDamagePerTurn } from "./shownThreat.ts";

function creature(over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: "x", type: "monster", name: "X", faction_id: "p", initiative: null, hp: 10, max_hp: 10, ac: "12", conditions: [], curses: [],
    death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 0, y: 0 }, size: "medium", ...over,
  };
}
const deeds = (over: Partial<ShownDeeds>): ShownDeeds => ({ dealt: 0, turns: 0, cast: 0, ranged: 0, melee: 0, ...over });

describe("damage per turn, as far as anyone has seen", () => {
  // 24 dealt over 2 turns is 12 a turn.
  // Bug caught: dividing by rounds or by attacks, or reading 0 turns as "deals nothing" (0 / 0 is NaN, nothing seen is null).
  it("is dealt over turns, and null until one of its turns has started", () => {
    expect(seenDamagePerTurn(creature({ shown_deeds: deeds({ dealt: 24, turns: 2 }) }))).toBe(12);
    expect(seenDamagePerTurn(creature({ shown_deeds: deeds({ dealt: 9, turns: 0 }) }))).toBeNull();
    expect(seenDamagePerTurn(creature())).toBeNull();
  });

  // A creature that has had a turn and dealt nothing is seen to deal 0, which is not "nothing seen".
  // Bug caught: 0 dealt treated as unknown, so the mover's fallback replaces a creature the fight has watched do nothing.
  it("is 0, not unknown, for a creature that has had a turn and dealt nothing", () => {
    expect(seenDamagePerTurn(creature({ shown_deeds: deeds({ turns: 1 }) }))).toBe(0);
  });
});

describe("what a creature has been seen as", () => {
  const none = { caster: false, archer: false, brawler: false };

  it("is none of the three when nothing has been seen", () => {
    expect(seenAs(creature())).toEqual(none);
    expect(seenAs(creature({ shown_deeds: deeds({ turns: 3 }) }))).toEqual(none);
  });

  // Bug caught: ranged >= melee makes an even mix an archer, or 0 ranged against 0 melee an archer.
  it("is an archer only with more ranged than melee, and a brawler with at least as much melee as ranged", () => {
    expect(seenAs(creature({ shown_deeds: deeds({ ranged: 2, melee: 1 }) }))).toEqual({ ...none, archer: true });
    expect(seenAs(creature({ shown_deeds: deeds({ ranged: 1, melee: 1 }) }))).toEqual({ ...none, brawler: true });
    expect(seenAs(creature({ shown_deeds: deeds({ ranged: 0, melee: 1 }) }))).toEqual({ ...none, brawler: true });
    expect(seenAs(creature({ shown_deeds: deeds({ ranged: 1, melee: 0 }) }))).toEqual({ ...none, archer: true });
  });

  // Bug caught: only a held concentration makes a caster, so a mage that cast and is not concentrating is "nothing";
  // or a mage holding a spell it was never seen to cast is not.
  it("is a caster once it has cast, or while it is seen holding a spell", () => {
    expect(seenAs(creature({ shown_deeds: deeds({ cast: 1 }) })).caster).toBe(true);
    expect(seenAs(creature({ concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] } })).caster).toBe(true);
    expect(seenAs(creature({ shown_deeds: deeds({ cast: 0, melee: 2 }) })).caster).toBe(false);
  });
});

describe("adding what a creature did", () => {
  // Bug caught: a deed of nothing makes a new object, so a command that changes nothing still saves and broadcasts the fight.
  it("returns the same object for a deed that adds nothing", () => {
    const current = deeds({ dealt: 3 });
    expect(addDeeds(current, {})).toBe(current);
    expect(addDeeds(current, { dealt: 0, cast: 0 })).toBe(current);
    expect(addDeeds(undefined, {})).toBeUndefined();
  });

  it("adds to what is there and starts from nothing", () => {
    expect(addDeeds(undefined, { dealt: 4, melee: 1 })).toEqual(deeds({ dealt: 4, melee: 1 }));
    expect(addDeeds(deeds({ dealt: 4, melee: 1 }), { dealt: 2.5, ranged: 1 })).toEqual(deeds({ dealt: 6.5, melee: 1, ranged: 1 }));
  });

  // Bug caught: the edge accepts a negative deed (a client that wipes what the fight has seen) or an unknown key.
  it("accepts only non-negative numbers on the known keys", () => {
    expect(isShownDeedDelta({ dealt: 3, cast: 1 })).toBe(true);
    expect(isShownDeedDelta({ dealt: -1 })).toBe(false);
    expect(isShownDeedDelta({ lore: 1 })).toBe(false);
    expect(isShownDeedDelta({ dealt: "3" })).toBe(false);
    expect(isShownDeedDelta(null)).toBe(false);
  });
});
