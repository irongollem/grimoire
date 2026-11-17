import { describe, expect, it } from "vitest";
import { combatantAt, isFoeOf, moveAllowed, targetOf } from "./mapRules";

const factions = [
  { id: "party", hostile_to: ["foes"] },
  { id: "foes", hostile_to: ["party"] },
  { id: "town", hostile_to: [] },
];
const me = { instance_id: "p-1", faction_id: "party" };
const goblin = { instance_id: "g1", faction_id: "foes", hp: 7, reveal_state: "revealed" as const };

describe("moveAllowed", () => {
  const base = { canMove: true, speedFeet: 30, movedFeet: 10, feet: 20 };

  it("allows a move that lands exactly on the speed", () => {
    // Bug caught: an off-by-one (>=) that refuses the last square of the speed.
    expect(moveAllowed(base)).toEqual({ ok: true });
  });

  it("refuses a move that takes the turn past the speed, counting what was already walked", () => {
    // Bug caught: the check ignoring movedFeet, so two 20 ft moves on a 30 ft speed both pass.
    const v = moveAllowed({ ...base, feet: 25 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("20 ft");
  });

  it("refuses everything off the player's turn, however short", () => {
    // Bug caught: canMove not consulted, so the token can be shuffled on a creature's turn.
    expect(moveAllowed({ ...base, canMove: false, feet: 5 }).ok).toBe(false);
  });
});

describe("isFoeOf", () => {
  it("is false for an ally, for the played character and for a fallen foe", () => {
    // Bug caught: an ally or a corpse picked as the target of an attack.
    expect(isFoeOf(me, { instance_id: "n1", faction_id: "town", hp: 5, reveal_state: "revealed" }, factions)).toBe(false);
    expect(isFoeOf(me, { ...goblin, instance_id: "p-1", faction_id: "party" }, factions)).toBe(false);
    expect(isFoeOf(me, { ...goblin, hp: 0 }, factions)).toBe(false);
  });

  it("is false for a foe the character cannot see", () => {
    // Bug caught: an unseen silhouette ("???") or a hidden creature offered as a target, which leaks where it is.
    expect(isFoeOf(me, { ...goblin, reveal_state: "unseen" }, factions)).toBe(false);
    expect(isFoeOf(me, { ...goblin, reveal_state: "hidden" }, factions)).toBe(false);
  });

  it("is true for a seen, standing foe, and a combatant with no reveal state counts as seen", () => {
    // Bug caught: requiring reveal_state to be present, which no ordinary combatant has.
    expect(isFoeOf(me, goblin, factions)).toBe(true);
    expect(isFoeOf(me, { instance_id: "g2", faction_id: "foes", hp: 3 }, factions)).toBe(true);
  });
});

describe("targetOf", () => {
  it("returns the clicked foe's id while armed", () => {
    // Bug caught: the click not reaching the attack at all.
    expect(targetOf({ arming: true, clicked: goblin, played: me, factions })).toBe("g1");
  });

  it("returns nothing when the map is not armed", () => {
    // Bug caught: a plain click on a foe starting an attack the player never asked for.
    expect(targetOf({ arming: false, clicked: goblin, played: me, factions })).toBeNull();
  });

  it("returns nothing for an ally, for oneself, or for an empty square", () => {
    // Bug caught: hostility not checked, so any token can be attacked.
    expect(targetOf({ arming: true, clicked: { ...goblin, faction_id: "town" }, played: me, factions })).toBeNull();
    expect(targetOf({ arming: true, clicked: { ...goblin, instance_id: "p-1", faction_id: "party" }, played: me, factions })).toBeNull();
    expect(targetOf({ arming: true, clicked: null, played: me, factions })).toBeNull();
  });
});

describe("combatantAt", () => {
  const size = (c: { big?: boolean }) => (c.big === true ? 2 : 1);
  type Piece = { id: string; big?: boolean; position: { x: number; y: number } | null };

  it("finds a big creature from any square of its space and not from the one beside it", () => {
    // Bug caught: only the anchor square counting, so a Large foe can be hit only at its corner.
    const ogre = { id: "o", big: true, position: { x: 3, y: 3 } };
    expect(combatantAt({ x: 4.4, y: 4.4 }, [ogre], size)).toBe(ogre);
    expect(combatantAt({ x: 5.1, y: 3.5 }, [ogre], size)).toBeNull();
  });

  it("skips a creature with no square", () => {
    // Bug caught: an unplaced creature read as standing at 0,0.
    const unplaced: Piece = { id: "x", position: null };
    expect(combatantAt({ x: 0.5, y: 0.5 }, [unplaced], size)).toBeNull();
  });
});
