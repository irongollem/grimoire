import { describe, expect, it } from "vitest";
import { actsBefore, ownMove, panToCentre, pointerToCell } from "./playerMapMove";
import type { RunCombatant } from "@/types/encounter.types";

const at = (x: number, y: number) => ({ x, y });
const person = (instance_id: string, name: string, reveal_state?: "revealed" | "unseen" | "hidden") =>
  ({ instance_id, name, reveal_state }) as RunCombatant;

describe("pointerToCell", () => {
  it("measures from the grid origin, not the page, so a panned map still hits the right square", () => {
    // x: (162.5 - host 10 - origin 40) / 50px cells = 2.25; y: (60 - 20 - 0) / 50 = 0.8
    expect(pointerToCell({ clientX: 162.5, clientY: 60 }, { left: 10, top: 20 }, at(40, 0), 50)).toEqual(at(2.25, 0.8));
  });
});

describe("ownMove", () => {
  const base = { instanceId: "p-1", from: at(2, 2), footprint: 1, speed: 30, usedFeet: 0 };

  it("a tap on the square the token stands on makes no move", () => {
    expect(ownMove({ ...base, pointer: at(2.5, 2.5) })).toBeNull();
  });

  it("4 squares across is 20 of 30 ft and within the speed (PHB 2024 'Moving': 5 ft a square)", () => {
    const m = ownMove({ ...base, pointer: at(6.5, 2.5) });
    expect(m?.feetText).toBe("20 of 30 ft");
    expect(m?.state).toBe("within");
    expect(m?.plan.to).toEqual(at(6, 2));
  });

  it("feet already moved this turn count toward the total and tip a move into a Dash", () => {
    const m = ownMove({ ...base, usedFeet: 20, pointer: at(5.5, 2.5) });
    expect(m?.feetText).toBe("35 of 30 ft");
    expect(m?.state).toBe("dash");
  });

  it("past twice the speed reads beyond, and a move is still returned (the counter never refuses)", () => {
    const m = ownMove({ ...base, pointer: at(15.5, 2.5) });
    expect(m?.state).toBe("beyond");
    expect(m?.plan.steps).toHaveLength(13);
  });

  it("without a known speed it shows plain feet and never colours a Dash", () => {
    const m = ownMove({ ...base, speed: null, pointer: at(12.5, 2.5) });
    expect(m?.feetText).toBe("50 ft");
    expect(m?.state).toBe("within");
  });

  it("a Large token snaps by its middle, so a tap lands the token centred on it", () => {
    const m = ownMove({ ...base, footprint: 2, pointer: at(6, 5) });
    expect(m?.plan.to).toEqual(at(5, 4));
  });
});

describe("panToCentre", () => {
  it("moves the map so the token's middle sits at the host's middle", () => {
    // Origin 0,0, 50px cells, token at cell 4,2 (middle 4.5,2.5 -> 225,125); host 300x200 wants 150,100.
    const pan = panToCentre({ hostW: 300, hostH: 200, origin: at(0, 0), cellPx: 50, pan: at(10, 10), at: at(4, 2), footprint: 1 });
    expect(pan).toEqual(at(10 + 150 - 225, 10 + 100 - 125));
  });

  it("centres a Large token on its middle, not its corner", () => {
    const pan = panToCentre({ hostW: 300, hostH: 200, origin: at(0, 0), cellPx: 50, pan: at(0, 0), at: at(4, 2), footprint: 2 });
    expect(pan).toEqual(at(150 - 250, 100 - 150));
  });
});

describe("actsBefore", () => {
  it("names the revealed creature just ahead of the player", () => {
    expect(actsBefore([person("a", "Ogre"), person("p-1", "Wren")], "p-1")).toBe("Ogre");
  });

  it("wraps: first in the order is after whoever is last", () => {
    expect(actsBefore([person("p-1", "Wren"), person("b", "Goblin")], "p-1")).toBe("Goblin");
  });

  it("never names an unseen creature", () => {
    expect(actsBefore([person("a", "Ash-wight", "unseen"), person("p-1", "Wren")], "p-1")).toBeNull();
  });

  it("says nothing when the player is not in the order", () => {
    expect(actsBefore([person("a", "Ogre"), person("b", "Goblin")], "p-1")).toBeNull();
  });
});
