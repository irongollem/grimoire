import { describe, expect, it } from "vitest";
import { dollAction } from "./dollAction";

const base = { isOwner: false, isDm: false, affordable: true, asked: false, hasDoll: false };

describe("dollAction", () => {
  it("lets a paying owner make and redraw their own doll", () => {
    expect(dollAction({ ...base, isOwner: true })).toMatchObject({ control: "make", label: "Make my doll" });
    expect(dollAction({ ...base, isOwner: true, hasDoll: true })).toMatchObject({ control: "make", label: "Redraw" });
  });

  it("asks the DM when the owner cannot afford a doll", () => {
    expect(dollAction({ ...base, isOwner: true, affordable: false }).control).toBe("ask");
    expect(dollAction({ ...base, isOwner: true, affordable: false, hasDoll: true }).control).toBe("ask");
  });

  it("shows the open ask with a withdraw once asked", () => {
    expect(dollAction({ ...base, isOwner: true, affordable: false, asked: true }).control).toBe("asked");
  });

  it("falls back to making when an asking player has since got credits", () => {
    expect(dollAction({ ...base, isOwner: true, asked: true }).control).toBe("make");
  });

  it("lets the DM draw any character's doll and shows an open ask", () => {
    expect(dollAction({ ...base, isDm: true })).toEqual({ control: "make", label: "Make doll", askedByPlayer: false });
    expect(dollAction({ ...base, isDm: true, hasDoll: true, asked: true })).toEqual({
      control: "make",
      label: "Redraw",
      askedByPlayer: true,
    });
  });

  it("gives the DM the make control even when the DM has no credits to spare", () => {
    expect(dollAction({ ...base, isDm: true, affordable: false }).control).toBe("make");
  });

  it("offers nothing to a stranger", () => {
    expect(dollAction(base).control).toBe("none");
  });
});
