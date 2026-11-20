import { describe, expect, it } from "vitest";
import { combatantAt, isFoeOf, reachZones, targetOf, walkVerdict } from "./mapRules";

const factions = [
  { id: "party", hostile_to: ["foes"] },
  { id: "foes", hostile_to: ["party"] },
  { id: "town", hostile_to: [] },
];
const me = { instance_id: "p-1", faction_id: "party" };
const goblin = { instance_id: "g1", faction_id: "foes", hp: 7, reveal_state: "revealed" as const };

describe("walkVerdict", () => {
  const base = { canMove: true, leftFeet: 20, feet: 20 };

  it("allows a move that costs exactly what the turn has left", () => {
    // Bug caught: an off-by-one (>=) that refuses the last square of the speed.
    expect(walkVerdict(base)).toEqual({ ok: true });
  });

  it("refuses a square only a Dash would reach, and says what is left", () => {
    // Bug caught: a square in the orange band walked to on the turn's own feet.
    const v = walkVerdict({ ...base, feet: 25 });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toContain("20 ft left");
  });

  it("refuses a square the search never reached: behind a wall, or past even a Dash", () => {
    // Bug caught: a square with no way to it treated as free (the token walked through a wall).
    expect(walkVerdict({ ...base, feet: null }).ok).toBe(false);
  });

  it("refuses everything off the player's turn, however short", () => {
    // Bug caught: canMove not consulted, so the token can be shuffled on a creature's turn.
    expect(walkVerdict({ ...base, canMove: false, feet: 5 }).ok).toBe(false);
  });
});

describe("reachZones", () => {
  const cells = [
    { cell: { x: 0, y: 0 }, feet: 0 },
    { cell: { x: 4, y: 0 }, feet: 20 },
    { cell: { x: 5, y: 0 }, feet: 25 },
  ];
  // Bug caught: the last square of the turn's own feet painted orange (< for <=), or the square stood on painted.
  it("marks what the turn can walk green up to and including its last foot, the rest as a Dash, and not the start", () => {
    expect(reachZones(cells, 20)).toEqual([
      { x: 4, y: 0, zone: "walk" },
      { x: 5, y: 0, zone: "dash" },
    ]);
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

describe("isFoeOf and the Hide action", () => {
  // Bug caught: a player aiming at a foe that is hiding (it has no known place), or a hiding foe silently shielding its friends.
  it("cannot pick a foe holding Hidden, can pick one that is not", () => {
    const hiding = { ...goblin, type: "monster" as const, conditions: [{ name: "Hidden", stealth: 15 }] };
    const open = { ...goblin, type: "monster" as const, conditions: [{ name: "Poisoned" }] };
    expect(isFoeOf(me, hiding, factions)).toBe(false);
    expect(isFoeOf(me, open, factions)).toBe(true);
    expect(targetOf({ arming: true, clicked: hiding, played: me, factions })).toBeNull();
  });
});
