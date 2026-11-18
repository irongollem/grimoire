/**
 * How long a journey takes in D&D 5e (#1222).
 *
 * PHB 2014 "Travel Pace" (chapter 8, "Movement") and PHB 2024 "Travel Pace" give the same three paces for a day of
 * eight hours on the road: slow 18 miles, normal 24, fast 30. A fast pace costs 5 from passive Wisdom
 * (Perception); a slow pace allows stealth. "Difficult Terrain" halves the distance covered.
 */
export type TravelPace = "slow" | "normal" | "fast";

/** Miles in a day's travel, PHB "Travel Pace". */
export const MILES_PER_DAY: Record<TravelPace, number> = { slow: 18, normal: 24, fast: 30 };
/** A day's travel is eight hours on the road, PHB "Travel Pace". */
export const HOURS_PER_TRAVEL_DAY = 8;

/** What the pace does besides distance, as the book puts it. Named for the DM, not enforced. */
export const PACE_EFFECT: Record<TravelPace, string> = {
  slow: "Able to use stealth",
  normal: "No effect",
  fast: "−5 to passive Wisdom (Perception)",
};

export interface TravelTime {
  /** Whole days on the road. */
  days: number;
  /** Hours of the last, unfinished day, to the half hour; 0 when the journey ends with a full day. */
  hours: number;
}

/**
 * How long so many miles take at a pace. Difficult going (PHB "Difficult Terrain": half speed) covers half the
 * distance in a day. Nothing to travel takes no time; a pace cannot make a negative distance.
 */
export function travelTime(miles: number, pace: TravelPace, options: { difficult?: boolean } = {}): TravelTime {
  if (!(miles > 0)) return { days: 0, hours: 0 };
  const perDay = MILES_PER_DAY[pace] / (options.difficult === true ? 2 : 1);
  const days = Math.floor(miles / perDay);
  const rest = miles - days * perDay;
  // To the half hour, never down to nothing: a mile left over is still some walking.
  const hours = rest <= 0 ? 0 : Math.max(0.5, Math.round((rest / perDay) * HOURS_PER_TRAVEL_DAY * 2) / 2);
  return hours >= HOURS_PER_TRAVEL_DAY ? { days: days + 1, hours: 0 } : { days, hours };
}

/** The days a journey takes off the calendar: every started day counts, since the party sleeps on the road. */
export function calendarDays(time: TravelTime): number {
  return time.days + (time.hours > 0 ? 1 : 0);
}

/** "2 days", "1 day and 3 hours", "half an hour", "4½ hours". */
export function travelTimeText(time: TravelTime): string {
  const days = time.days === 0 ? "" : `${time.days} ${time.days === 1 ? "day" : "days"}`;
  const whole = Math.floor(time.hours);
  const half = time.hours - whole >= 0.5;
  const hours = time.hours === 0 ? "" : whole === 0 ? "half an hour" : `${whole}${half ? "½" : ""} ${whole === 1 && !half ? "hour" : "hours"}`;
  if (days === "" && hours === "") return "no time at all";
  return days !== "" && hours !== "" ? `${days} and ${hours}` : days + hours;
}
