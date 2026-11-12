import { describe, expect, it } from "vitest";
import type { Layer } from "../session/types";
import { displayOrder, dropIndex, keyboardMoveIndex, sessionIndex } from "./layersOrder";

const picture = { kind: "picture", id: "picture", name: "x", visible: true } as unknown as Layer;
const paint = (id: string) => ({ kind: "paint", id, name: id, blend: "source-over", opacity: 1, visible: true, lockAlpha: false }) as unknown as Layer;
const stack = [picture, paint("a"), paint("b"), paint("c")];

describe("index conversion", () => {
  it("shows the top layer first", () => {
    expect(displayOrder(stack).map((l) => l.id)).toEqual(["c", "b", "a", "picture"]);
  });
  it("maps the first and last display rows to the last and first session indices", () => {
    expect(sessionIndex(0, 4)).toBe(3);
    expect(sessionIndex(3, 4)).toBe(0);
  });
  it("clamps a drop beyond either end", () => {
    expect(dropIndex(-2, 4)).toBe(3);
    expect(dropIndex(9, 4)).toBe(0);
  });
});

describe("keyboardMoveIndex", () => {
  it("raises and lowers by one, and stops at the top", () => {
    expect(keyboardMoveIndex(stack, "a", "up")).toBe(2);
    expect(keyboardMoveIndex(stack, "c", "up")).toBeNull();
  });
  it("never lowers a layer under the picture", () => {
    expect(keyboardMoveIndex(stack, "a", "down")).toBeNull();
  });
  it("never moves the picture", () => {
    expect(keyboardMoveIndex(stack, "picture", "up")).toBeNull();
  });
});
