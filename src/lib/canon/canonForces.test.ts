import { describe, expect, it } from "vitest";
import { clockFilled, clockStepsDivergence, forceWhoNames } from "./canonForces";

const tick = (delta = 1) => ({ delta });

describe("clockFilled", () => {
  it("is the sum of the ticks, so an undo that removes a tick moves the dial back", () => {
    expect(clockFilled([tick(1), tick(1), tick(-1)], 6)).toBe(1);
  });

  it("never runs past the clock's size, so a seventh tick on a clock of six does not draw a seventh segment", () => {
    expect(clockFilled(Array.from({ length: 7 }, () => tick()), 6)).toBe(6);
  });

  it("never runs below nothing, so ticking back on an empty clock is not a debt", () => {
    expect(clockFilled([tick(-2)], 6)).toBe(0);
  });
});

describe("clockStepsDivergence", () => {
  const step = (reached: boolean) => ({ reached_at: reached ? "t" : null });

  // Bug caught (#1258 item 11): a full clock with steps still to come said nothing, so the force looked finished and unfinished at once.
  it("says a full clock leaves steps unreached, counting them", () => {
    expect(clockStepsDivergence(4, 4, [step(true), step(false), step(false)])).toBe("The clock is full with 2 steps unreached.");
    expect(clockStepsDivergence(4, 4, [step(false)])).toBe("The clock is full with 1 step unreached.");
  });

  // Bug caught: every step reached and a half-empty clock said nothing, so the force's last move never showed on its dial.
  it("says every step is reached while the clock is short", () => {
    expect(clockStepsDivergence(8, 3, [step(true), step(true), step(true)])).toBe("Every step is reached; the clock stands at 3 of 8.");
  });

  // Bug caught: the line shown for a clock and steps that agree, or one that has no clock or no steps to disagree with.
  it("says nothing when they agree or either is absent", () => {
    expect(clockStepsDivergence(4, 4, [step(true), step(true)])).toBeNull();
    expect(clockStepsDivergence(4, 2, [step(true), step(false)])).toBeNull();
    expect(clockStepsDivergence(null, 0, [step(true)])).toBeNull();
    expect(clockStepsDivergence(4, 4, [])).toBeNull();
  });
});

describe("forceWhoNames", () => {
  const factions = [{ id: "fa1", name: "The Ferrymen (renamed)" }];

  // Bug caught (#1258 item 16): the force showed the name it was created with, so renaming its faction left it stale.
  it("names a force's faction by the faction's current name", () => {
    expect(forceWhoNames([{ force_id: "f1", faction_id: "fa1" }], factions).get("f1")).toEqual({ id: "fa1", name: "The Ferrymen (renamed)" });
  });

  // Bug caught: a second `about` link overwrote the first, so the Who changed with the order the rows came back in.
  it("keeps the first link when a force has two", () => {
    const two = [{ id: "fa1", name: "A" }, { id: "fa2", name: "B" }];
    expect(forceWhoNames([{ force_id: "f1", faction_id: "fa1" }, { force_id: "f1", faction_id: "fa2" }], two).get("f1")?.name).toBe("A");
  });

  // Bug caught: a link to a faction that is gone, or to none, read as "Who: undefined".
  it("has no who for a force with no link or a faction that is gone", () => {
    const who = forceWhoNames([{ force_id: "f2", faction_id: "gone" }], factions);
    expect(who.has("f1")).toBe(false);
    expect(who.has("f2")).toBe(false);
  });
});
