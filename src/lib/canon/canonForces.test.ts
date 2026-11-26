import { describe, expect, it } from "vitest";
import { campaignToday, clockFilled, clockStepsDivergence, dueSteps, duePatch, firstOverdueStep, overdueLine, stepOverdue } from "./canonForces";
import { canonEntry } from "@/test/canonEntry";
import type { CanonForceStep } from "@/types/canon.types";

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

const due = (over: Partial<CanonForceStep> = {}): CanonForceStep => ({
  id: "s1", user_id: "u", campaign_id: "c1", force_id: "f1", title: "The orchards sour", sort_order: 0, reached_at: null, reached_session_id: null,
  due_year: null, due_month: null, due_day: null, calendar_event_id: null, ai_provenance: null, created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...over,
});
const day = (year: number, month: number, d: number) => ({ year, month, day: d });
const fmt = (y: number, m: number | null, d: number | null) => `${d ?? ""} m${m ?? ""} y${y}`.trim();

describe("duePatch", () => {
  // Bug caught: a day typed with no month sent as it is, which the table refuses (23514) and the DM loses the edit.
  it("never sends a day without its month, nor a month without its year", () => {
    expect(duePatch({ year: 512, month: null, day: 3 })).toEqual({ due_year: 512, due_month: null, due_day: null });
    expect(duePatch({ year: null, month: 4, day: 3 })).toEqual({ due_year: null, due_month: null, due_day: null });
  });

  // Bug caught: the precision the DM chose (a whole date) squeezed down to a year on the way out.
  it("keeps a whole date whole", () => {
    expect(duePatch(day(512, 4, 3))).toEqual({ due_year: 512, due_month: 4, due_day: 3 });
  });
});

describe("stepOverdue", () => {
  // Bug caught: a date due in a month called late for the whole of that month, or never late (off-by-one on the comparison).
  it("is late only once the day, month or year it is due in is over, each at its own precision", () => {
    expect(stepOverdue(due({ due_year: 512, due_month: 3, due_day: 3 }), day(512, 3, 4))).toBe(true);
    expect(stepOverdue(due({ due_year: 512, due_month: 3, due_day: 3 }), day(512, 3, 3))).toBe(false);
    expect(stepOverdue(due({ due_year: 512, due_month: 3 }), day(512, 3, 28))).toBe(false);
    expect(stepOverdue(due({ due_year: 512, due_month: 3 }), day(512, 4, 1))).toBe(true);
    expect(stepOverdue(due({ due_year: 512 }), day(512, 12, 30))).toBe(false);
    expect(stepOverdue(due({ due_year: 512 }), day(513, 1, 1))).toBe(true);
  });

  // Bug caught: a later month of an earlier year read as not late (comparing month before year), or an earlier year as late.
  it("compares the year before the month", () => {
    expect(stepOverdue(due({ due_year: 512, due_month: 11 }), day(513, 1, 1))).toBe(true);
    expect(stepOverdue(due({ due_year: 512, due_month: 1 }), day(511, 12, 30))).toBe(false);
  });

  // Bug caught: a reached step, an undated one, or a campaign with no calendar nagging as "not reached".
  it("is never late for a reached step, an undated step or an unknown today", () => {
    expect(stepOverdue(due({ due_year: 1, reached_at: "2026-11-02T10:00:00Z" }), day(900, 1, 1))).toBe(false);
    expect(stepOverdue(due(), day(900, 1, 1))).toBe(false);
    expect(stepOverdue(due({ due_year: 1 }), null)).toBe(false);
  });
});

describe("overdueLine", () => {
  // Bug caught: the line naming the wrong date, or saying "reached" for a step that was not.
  it("says when the step was due and that it was not reached", () => {
    expect(overdueLine(due({ due_year: 512, due_month: 3, due_day: 3 }), day(512, 4, 1), fmt)).toBe("Due 3 m3 y512, not reached.");
    expect(overdueLine(due({ due_year: 512, due_month: 3, due_day: 3 }), day(512, 3, 3), fmt)).toBeNull();
  });
});

describe("firstOverdueStep", () => {
  // Bug caught: the force row naming a step that is not late, or a reached one.
  it("is the first step in order that is late and unreached", () => {
    const steps = [due({ id: "a", due_year: 1, reached_at: "x" }), due({ id: "b", due_year: 900 }), due({ id: "c", due_year: 2 })];
    expect(firstOverdueStep(steps, day(512, 1, 1))?.id).toBe("c");
    expect(firstOverdueStep(steps, day(0, 1, 1))).toBeNull();
  });
});

describe("campaignToday", () => {
  // Bug caught: a campaign with no calendar treated as being on its default year 1 and every dated step flagged late.
  it("is unknown when the campaign keeps no calendar", () => {
    expect(campaignToday({ calendar_id: null, current_year: 1, current_month: 1, current_day: 1 })).toBeNull();
    expect(campaignToday({ calendar_id: "harptos", current_year: 1491, current_month: 2, current_day: 9 })).toEqual(day(1491, 2, 9));
  });
});

describe("dueSteps", () => {
  // Bug caught: reached steps (already a tick), undated steps and steps of an ended or deleted force listed as due.
  it("keeps unreached dated steps of a force that is still moving", () => {
    const forces = [canonEntry({ id: "f1", part: "force" }), canonEntry({ id: "f2", part: "force", closed_at: "2026-11-02T10:00:00Z", closed_as: "stopped" })];
    const steps = [
      due({ id: "keep", due_year: 5 }), due({ id: "reached", due_year: 5, reached_at: "x" }), due({ id: "undated" }),
      due({ id: "ended", force_id: "f2", due_year: 5 }), due({ id: "gone", force_id: "zz", due_year: 5 }),
    ];
    expect(dueSteps(steps, forces).map((d) => d.step.id)).toEqual(["keep"]);
  });
});
