import { describe, expect, it } from "vitest";
import { endsOf, moveToEnd, moveWithin } from "./canonOrder";

const rows = (...orders: number[]) => orders.map((sort_order, i) => ({ id: `r${i + 1}`, sort_order }));

describe("moveWithin", () => {
  // Bug caught: a move that writes the wrong neighbour (down for up), leaving the list as it was.
  it("moving up swaps a row's place with the one before it", () => {
    expect(moveWithin(rows(0, 1, 2), "r3", -1)).toEqual([{ id: "r3", sort_order: 1 }, { id: "r2", sort_order: 2 }]);
  });

  it("moving down swaps a row's place with the one after it", () => {
    expect(moveWithin(rows(0, 1, 2), "r1", 1)).toEqual([{ id: "r1", sort_order: 1 }, { id: "r2", sort_order: 0 }]);
  });

  // Bug caught: the first row asked to go up wrapping round or writing a place before 0.
  it("the first cannot move up and the last cannot move down", () => {
    expect(moveWithin(rows(0, 1), "r1", -1)).toEqual([]);
    expect(moveWithin(rows(0, 1), "r2", 1)).toEqual([]);
  });

  it("writes nothing for a row that is not in the list", () => {
    expect(moveWithin(rows(0, 1), "ghost", 1)).toEqual([]);
  });

  // Bug caught (new entries take `length` as their place, so a list that lost a row has doubles): swapping two equal
  // values changes nothing, so the button looked dead.
  it("renumbers a list whose places collide, so a move always changes the order", () => {
    const list = rows(0, 1, 1, 3);
    const writes = moveWithin(list, "r3", -1);
    const next = list.map((r) => writes.find((w) => w.id === r.id) ?? r).sort((a, b) => a.sort_order - b.sort_order).map((r) => r.id);
    expect(next).toEqual(["r1", "r3", "r2", "r4"]);
  });

  it("writes only the rows whose place changed when it renumbers", () => {
    // New order r1 r3 r2 r4 takes places 0 1 2 3: r1, r3 and r4 already hold theirs, so only r2 is written.
    expect(moveWithin(rows(0, 1, 1, 3), "r3", -1)).toEqual([{ id: "r2", sort_order: 2 }]);
  });
});

describe("endsOf", () => {
  it("marks the first and last rows, so their dead button is disabled", () => {
    expect(endsOf(rows(0, 1, 2), "r1")).toEqual({ first: true, last: false });
    expect(endsOf(rows(0, 1, 2), "r3")).toEqual({ first: false, last: true });
  });

  it("offers nothing for a list of one, which has nowhere to go", () => {
    expect(endsOf(rows(0), "r1")).toBeNull();
  });
});

describe("moveToEnd", () => {
  const apply = (list: ReturnType<typeof rows>, writes: { id: string; sort_order: number }[]) =>
    list.map((r) => writes.find((w) => w.id === r.id) ?? r).sort((a, b) => a.sort_order - b.sort_order).map((r) => r.id);

  // Bug caught: "Move to top" swapping with the neighbour (a single step) instead of jumping to the head.
  it("takes a row to the top and shifts the ones above it down", () => {
    const list = rows(0, 1, 2, 3);
    expect(apply(list, moveToEnd(list, "r3", "top"))).toEqual(["r3", "r1", "r2", "r4"]);
  });

  it("takes a row to the bottom and shifts the ones below it up", () => {
    const list = rows(0, 1, 2, 3);
    expect(apply(list, moveToEnd(list, "r2", "bottom"))).toEqual(["r1", "r3", "r4", "r2"]);
  });

  // Bug caught: a row already at the end rewriting the whole list (a write storm for nothing).
  it("writes nothing for a row already at that end, or one not in the list", () => {
    expect(moveToEnd(rows(0, 1, 2), "r1", "top")).toEqual([]);
    expect(moveToEnd(rows(0, 1, 2), "r3", "bottom")).toEqual([]);
    expect(moveToEnd(rows(0, 1, 2), "ghost", "top")).toEqual([]);
  });

  // Bug caught: colliding places (new rows take `length`) leaving two rows equal after the jump.
  it("renumbers a list with doubles so the jump holds, writing only rows that change", () => {
    const list = rows(0, 1, 1, 3);
    expect(apply(list, moveToEnd(list, "r4", "top"))).toEqual(["r4", "r1", "r2", "r3"]);
    expect(moveToEnd(rows(0, 1, 2), "r2", "top")).toEqual([{ id: "r2", sort_order: 0 }, { id: "r1", sort_order: 1 }]);
  });
});

describe("endsOf toEnds", () => {
  it("asks for the top and bottom buttons only when the list opts in", () => {
    expect(endsOf(rows(0, 1), "r1", true)).toEqual({ first: true, last: false, toEnds: true });
    expect(endsOf(rows(0, 1), "r1")).not.toHaveProperty("toEnds");
  });
});
