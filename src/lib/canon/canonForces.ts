import { normaliseDate, worldDateLabel, type WorldDate } from "./canonLore";
import type { Campaign } from "@/types/campaign.types";
import type { CanonEntry, CanonForceStep, CanonForceTick } from "@/types/canon.types";

/**
 * A force's clock, as a number: the sum of its ticks, never past its size or below nothing. The ticks keep whatever
 * was written. Pure and in `lib` because the Canon page, the quest and faction pages and Tonight all read it, and a
 * `lib` module may not reach into a composable for it.
 */
export function clockFilled(ticks: readonly Pick<CanonForceTick, "delta">[], size: number): number {
  const sum = ticks.reduce((total, t) => total + t.delta, 0);
  return Math.min(size, Math.max(0, sum));
}

/**
 * The one quiet line for a force whose clock and steps disagree (#1258 item 11): a full clock with steps still unreached,
 * or every step reached with the clock short of full. A force with no clock or no steps has nothing to disagree with.
 * The clock and the steps are two ways of saying how far the force has come; they are not bound to each other, so this
 * only says when they have drifted apart.
 */
export function clockStepsDivergence(size: number | null, filled: number, steps: readonly { reached_at: string | null }[]): string | null {
  if (size === null || steps.length === 0) return null;
  const unreached = steps.filter((s) => s.reached_at === null).length;
  if (filled >= size && unreached > 0) return `The clock is full with ${unreached} ${unreached === 1 ? "step" : "steps"} unreached.`;
  if (unreached === 0 && filled < size) return `Every step is reached; the clock stands at ${filled} of ${size}.`;
  return null;
}

// ── A step's due date (#1258 item 9) ─────────────────────────────────────────

type DueColumns = Pick<CanonForceStep, "due_year" | "due_month" | "due_day">;

/** The date a step is due, as the three columns carry it: a year, a year and month, or a whole date; all null for none. */
export const stepDue = (step: DueColumns): WorldDate => ({ year: step.due_year, month: step.due_month, day: step.due_day });

/** The three columns a due date writes. Normalised first, so a day without its month (which the table refuses) is never sent. */
export function duePatch(date: WorldDate): DueColumns {
  const d = normaliseDate(date);
  return { due_year: d.year, due_month: d.month, due_day: d.day };
}

/** The campaign's current date in the world, or null when it keeps no calendar (its date is then a default nobody set). */
export function campaignToday(campaign: Pick<Campaign, "calendar_id" | "current_year" | "current_month" | "current_day"> | null): WorldDate | null {
  if (campaign === null || campaign.calendar_id === null) return null;
  return { year: campaign.current_year, month: campaign.current_month, day: campaign.current_day };
}

/**
 * Whether an unreached step's due date has gone by. The due date is read at its own precision: a step due in a year is
 * late once that year is over, one due in a month once the month is over, one due on a day once the day is over. A
 * reached step, an undated one, or an unknown today is never late.
 */
export function stepOverdue(step: DueColumns & Pick<CanonForceStep, "reached_at">, today: WorldDate | null): boolean {
  if (step.reached_at !== null || step.due_year === null || today === null || today.year === null) return false;
  if (today.year !== step.due_year) return today.year > step.due_year;
  if (step.due_month === null || today.month === null) return false;
  if (today.month !== step.due_month) return today.month > step.due_month;
  if (step.due_day === null || today.day === null) return false;
  return today.day > step.due_day;
}

/** The quiet line for a late step: "Due 3 Harvest, not reached." Null when the step is not late. */
export function overdueLine(
  step: DueColumns & Pick<CanonForceStep, "reached_at">,
  today: WorldDate | null,
  format: (year: number, month: number | null, day: number | null, festival: string | null) => string,
): string | null {
  if (!stepOverdue(step, today)) return null;
  const when = worldDateLabel(stepDue(step), format);
  return when === null ? null : `Due ${when}, not reached.`;
}

/** The first late step of a force, in the order given: the one its row and detail name. Null when none is late. */
export function firstOverdueStep<T extends DueColumns & Pick<CanonForceStep, "reached_at">>(steps: readonly T[], today: WorldDate | null): T | null {
  return steps.find((s) => stepOverdue(s, today)) ?? null;
}

/**
 * The steps the calendar and the almanac show as "due": unreached steps that carry a due date, of a force that is still
 * moving. A reached step is a tick in the past already; the step of an ended force or of a force that is gone will not
 * happen, so none of those is offered.
 */
export function dueSteps(steps: readonly CanonForceStep[], forces: readonly CanonEntry[]): { step: CanonForceStep; force: CanonEntry }[] {
  const live = new Map(forces.filter((f) => f.part === "force" && f.closed_at === null).map((f) => [f.id, f] as const));
  return steps.flatMap((step) => {
    const force = live.get(step.force_id);
    return force === undefined || step.reached_at !== null || step.due_year === null ? [] : [{ step, force }];
  });
}
