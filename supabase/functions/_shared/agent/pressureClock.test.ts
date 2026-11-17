import { describe, expect, it } from "vitest";
import { clockToDelete, madeAfter } from "./pressureClock";

describe("clockToDelete", () => {
  it("deletes a clock the table made when the pressure ends, so a sitting leaves no full clock on the quest", () => {
    expect(clockToDelete({ clockId: "made", made: true }, null)).toBe("made");
  });

  it("deletes a clock the table made when the scene moves to another clock", () => {
    expect(clockToDelete({ clockId: "made", made: true }, { clockId: "other", made: false })).toBe("made");
  });

  it("never deletes a clock the DM authored, which is only let go of", () => {
    expect(clockToDelete({ clockId: "authored", made: false }, null)).toBeNull();
  });

  it("keeps the clock when the conversation is pointed at the same one again", () => {
    expect(clockToDelete({ clockId: "made", made: true }, { clockId: "made", made: true })).toBeNull();
  });

  it("has nothing to delete when the scene was under no pressure", () => {
    expect(clockToDelete({ clockId: null, made: true }, null)).toBeNull();
  });
});

describe("madeAfter", () => {
  it("keeps the table's mark when the narrator runs against its own clock again, or the clock outlives the sitting", () => {
    expect(madeAfter({ clockId: "made", made: true }, { clockId: "made", made: false })).toBe(true);
  });

  it("does not carry the mark over to a different, authored clock", () => {
    expect(madeAfter({ clockId: "made", made: true }, { clockId: "authored", made: false })).toBe(false);
  });

  it("marks a clock the table just started, and nothing once the pressure ends", () => {
    expect(madeAfter({ clockId: null, made: false }, { clockId: "new", made: true })).toBe(true);
    expect(madeAfter({ clockId: "made", made: true }, null)).toBe(false);
  });
});
