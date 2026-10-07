/**
 * Overland travel pace, by the book. The 2014 and 2024 rules give the same
 * distances, so the numbers carry no ruleset switch; the game effect of each
 * pace changed in 2024 (Perception/Survival/Stealth disadvantage and advantage
 * instead of a passive Perception penalty), so `effect` is per edition.
 *
 * One source for the numbers: the DM screen's Travel Pace table and the Atlas
 * measuring tool both read this file, so a table and a calculator can never
 * disagree about how far a party walks in a day.
 */

import type { RulesetKey } from "@/types/ruleset.types";

export type TravelPaceId = "slow" | "normal" | "fast";

export type DistanceUnit = "mi" | "km";

export interface TravelPace {
  id: TravelPaceId;
  label: string;
  /** The book's "per minute" column, in feet (rounded as printed). */
  feetPerMinute: number;
  milesPerHour: number;
  milesPerDay: number;
  /** What the pace costs or allows, per edition, as the book words it. Null where the edition gives none. */
  effect: Readonly<Record<RulesetKey, string | null>>;
}

/** A travel day is eight hours of walking; the rest is rest. */
export const TRAVEL_HOURS_PER_DAY = 8;

export const MILES_PER_KM = 1 / 1.609344;
export const KM_PER_MILE = 1.609344;

/** Slowest first, the order a DM reads them in. */
export const TRAVEL_PACES: readonly TravelPace[] = [
  {
    id: "slow", label: "Slow", feetPerMinute: 200, milesPerHour: 2, milesPerDay: 18,
    effect: { "2014": "Able to use Stealth.", "2024": "Advantage on Wisdom (Perception or Survival) checks." },
  },
  {
    id: "normal", label: "Normal", feetPerMinute: 300, milesPerHour: 3, milesPerDay: 24,
    effect: { "2014": null, "2024": "Disadvantage on Dexterity (Stealth) checks." },
  },
  {
    id: "fast", label: "Fast", feetPerMinute: 400, milesPerHour: 4, milesPerDay: 30,
    effect: {
      "2014": "−5 penalty to passive Wisdom (Perception) scores.",
      "2024": "Disadvantage on Wisdom (Perception or Survival) and Dexterity (Stealth) checks.",
    },
  },
];

export const DEFAULT_TRAVEL_PACE: TravelPaceId = "normal";

export function getTravelPace(id: TravelPaceId): TravelPace {
  const pace = TRAVEL_PACES.find((p) => p.id === id);
  if (!pace) throw new Error(`Unknown travel pace: ${id}`);
  return pace;
}

export function toMiles(distance: number, unit: DistanceUnit): number {
  return unit === "mi" ? distance : distance * MILES_PER_KM;
}

export function fromMiles(miles: number, unit: DistanceUnit): number {
  return unit === "mi" ? miles : miles * KM_PER_MILE;
}

export interface TravelTime {
  /** Travel hours in total (eight to a day), to a thousandth. */
  totalHours: number;
  /** Whole travel days (of `TRAVEL_HOURS_PER_DAY` hours each). */
  days: number;
  /** Hours left over after the whole days, 0 up to just under a day. */
  hours: number;
  /** Days the trip occupies on the calendar: any started day counts. */
  calendarDays: number;
}

/**
 * How long a distance takes at a pace. The distance is in the map's own unit.
 *
 * The book's per-day figure is the authority for days, not hourly rate times
 * eight: Fast and Slow do not multiply out (4 x 8 = 32, printed 30; 2 x 8 =
 * 16, printed 18), and a DM who reads "30 miles a day" off the table expects a
 * 30-mile trip at a fast pace to take one day. So days = miles / milesPerDay,
 * and the fraction of a day is spread over an eight-hour travel day. A partial
 * hour rounds up ("1 day, 1 hour", not "1 day, 0.33 hours"), and a float
 * residue never leaves a phantom hour or day behind.
 */
export function travelTime(distance: number, unit: DistanceUnit, paceId: TravelPaceId): TravelTime {
  const pace = getTravelPace(paceId);
  const miles = Math.max(0, toMiles(distance, unit));
  // Rounded to a thousandth so 8.0000000001 hours does not tip into a new hour.
  const totalHours = Math.round((miles / pace.milesPerDay) * TRAVEL_HOURS_PER_DAY * 1000) / 1000;
  const wholeHours = Math.ceil(totalHours);
  const days = Math.floor(wholeHours / TRAVEL_HOURS_PER_DAY);
  const hours = wholeHours - days * TRAVEL_HOURS_PER_DAY;
  return { totalHours, days, hours, calendarDays: Math.ceil(totalHours / TRAVEL_HOURS_PER_DAY) };
}

/** "2 days, 3 hours", "5 hours", "1 day". Nothing at zero distance reads "0 hours". */
export function formatTravelTime(time: Pick<TravelTime, "days" | "hours">): string {
  const parts: string[] = [];
  if (time.days > 0) parts.push(`${time.days} ${time.days === 1 ? "day" : "days"}`);
  if (time.hours > 0) parts.push(`${time.hours} ${time.hours === 1 ? "hour" : "hours"}`);
  return parts.length ? parts.join(", ") : "0 hours";
}
