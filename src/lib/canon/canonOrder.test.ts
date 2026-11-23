import { describe, expect, it } from "vitest";
import { endsOf, moveWithin } from "./canonOrder";

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
