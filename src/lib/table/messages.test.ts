import { describe, expect, it } from "vitest";
import { MAX_POINTS, parseTableMessage, tableTopic } from "./messages";

const by = { id: "u", name: "Ayla", color: "#abc" };

describe("parseTableMessage", () => {
  it("topic is table:<id> so it cannot collide with the doorbell", () => {
    expect(tableTopic("x")).toBe("table:x");
  });

  it("rejects a colour that could carry markup into the receiver's SVG", () => {
    const m = { event: "draw", id: "d", points: [[0, 0]], color: "red\" onload=\"x", width: 2, by, pinned: false, at: 1 };
    expect(parseTableMessage(m)).toBeNull();
  });

  it("rejects non-finite and non-numeric coordinates", () => {
    expect(parseTableMessage({ event: "measure", id: "m", points: [[0, Infinity]], by, at: 1 })).toBeNull();
    expect(parseTableMessage({ event: "measure", id: "m", points: [["0", 1]], by, at: 1 })).toBeNull();
  });

  it("accepts exactly the point cap and rejects one more", () => {
    const pts = (n: number) => Array.from({ length: n }, () => [1, 1]);
    expect(parseTableMessage({ event: "measure", id: "m", points: pts(MAX_POINTS), by, at: 1 })).not.toBeNull();
    expect(parseTableMessage({ event: "measure", id: "m", points: pts(MAX_POINTS + 1), by, at: 1 })).toBeNull();
  });

  it("rejects a draw whose pinned flag is not a boolean or whose width is not positive", () => {
    const ok = { event: "draw", id: "d", points: [[0, 0]], color: "#fff", width: 2, by, pinned: false, at: 1 };
    expect(parseTableMessage(ok)).not.toBeNull();
    expect(parseTableMessage({ ...ok, pinned: "yes" })).toBeNull();
    expect(parseTableMessage({ ...ok, width: 0 })).toBeNull();
  });

  it("rejects an unknown event and a draw-clear naming nothing", () => {
    expect(parseTableMessage({ event: "boom" })).toBeNull();
    expect(parseTableMessage({ event: "draw-clear" })).toBeNull();
    expect(parseTableMessage({ event: "draw-clear", all: true })).toEqual({ event: "draw-clear", all: true });
  });
});
