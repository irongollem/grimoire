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

import type { RulesetKey } from "../types/ruleset.types.ts";

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
  return timeOfHours((miles / pace.milesPerDay) * TRAVEL_HOURS_PER_DAY);
}

/** A number of travel hours (eight to a day) as the app writes a time: part hours round up, float residue is dropped. */
function timeOfHours(rawHours: number): TravelTime {
  // Rounded to a thousandth so 8.0000000001 hours does not tip into a new hour.
  const totalHours = Math.round(rawHours * 1000) / 1000;
  const wholeHours = Math.ceil(totalHours);
  const days = Math.floor(wholeHours / TRAVEL_HOURS_PER_DAY);
  const hours = wholeHours - days * TRAVEL_HOURS_PER_DAY;
  return { totalHours, days, hours, calendarDays: Math.ceil(totalHours / TRAVEL_HOURS_PER_DAY) };
}

/*
 * Mounts: a mount changes nothing here, on purpose. By the book (PHB "Travel Pace", "Mounts and Vehicles") a
 * mount's faster speed is a gallop that lasts an hour before the animal tires, not a pace it keeps for a day, so
 * a mounted party travels the day's distance of its pace like one on foot. No mount pace is offered.
 */

export type VesselId = "galley" | "keelboat" | "longship" | "rowboat" | "sailing_ship" | "warship" | "airship";

export interface Vessel {
  id: VesselId;
  label: string;
  /** PHB "Mounts and Vehicles", Waterborne Vehicles: miles in an hour. */
  milesPerHour: number;
}

/** Waterborne vehicles by the book, in both editions. The Airship is a 2024 entry; the 2014 table has none. */
export const VESSELS: readonly Vessel[] = [
  { id: "galley", label: "Galley", milesPerHour: 4 },
  { id: "keelboat", label: "Keelboat", milesPerHour: 1 },
  { id: "longship", label: "Longship", milesPerHour: 3 },
  { id: "rowboat", label: "Rowboat", milesPerHour: 1.5 },
  { id: "sailing_ship", label: "Sailing ship", milesPerHour: 2 },
  { id: "warship", label: "Warship", milesPerHour: 2.5 },
  { id: "airship", label: "Airship", milesPerHour: 8 },
];

export function getVessel(id: VesselId): Vessel {
  const vessel = VESSELS.find((v) => v.id === id);
  if (!vessel) throw new Error(`Unknown vessel: ${id}`);
  return vessel;
}

/**
 * How the party gets along: on foot (or mounted, which is the same by the book) at a pace, or aboard a vessel on
 * the water legs of a journey. The book gives a vessel no miles a day, so it sails the app's travel day of
 * `TRAVEL_HOURS_PER_DAY` hours, or round the clock when `throughTheNight`.
 */
export interface Conveyance {
  vessel: VesselId | null;
  throughTheNight: boolean;
}

export const ON_FOOT: Conveyance = { vessel: null, throughTheNight: false };

/** The stretch of a journey, as far as its time goes. */
export interface TimedLeg {
  miles: number;
  /** Difficult terrain halves the distance a day covers (PHB "Travel Pace"). */
  difficult: boolean;
  going: "road" | "track" | "river" | "sea";
}

/**
 * Travel hours (eight to a day) one leg takes. On land: the pace's miles a day, halved on difficult going, so
 * twice the time. On a river or the sea with a vessel chosen: miles over the vessel's speed gives hours under
 * way, and a vessel under way for 8 (or, through the night, 24) hours is one travel day, so those hours are
 * rescaled to travel hours. Difficult going does not slow a vessel. A water leg with no vessel chosen is covered
 * at the pace like land: the DM has not said the party takes a boat.
 */
export function legHours(leg: TimedLeg, paceId: TravelPaceId, conveyance: Conveyance): number {
  const miles = Math.max(0, leg.miles);
  const onWater = leg.going === "river" || leg.going === "sea";
  if (onWater && conveyance.vessel !== null) {
    const underWay = miles / getVessel(conveyance.vessel).milesPerHour;
    return (underWay * TRAVEL_HOURS_PER_DAY) / (conveyance.throughTheNight ? 24 : TRAVEL_HOURS_PER_DAY);
  }
  return (miles / getTravelPace(paceId).milesPerDay) * TRAVEL_HOURS_PER_DAY * (leg.difficult ? 2 : 1);
}

/** How long a journey of several legs takes: the sum of its legs' hours, written like `travelTime`. */
export function journeyTime(legs: readonly TimedLeg[], paceId: TravelPaceId, conveyance: Conveyance = ON_FOOT): TravelTime {
  return timeOfHours(legs.reduce((hours, leg) => hours + legHours(leg, paceId, conveyance), 0));
}

/** "2 days, 3 hours", "5 hours", "1 day". Nothing at zero distance reads "0 hours". */
export function formatTravelTime(time: Pick<TravelTime, "days" | "hours">): string {
  const parts: string[] = [];
  if (time.days > 0) parts.push(`${time.days} ${time.days === 1 ? "day" : "days"}`);
  if (time.hours > 0) parts.push(`${time.hours} ${time.hours === 1 ? "hour" : "hours"}`);
  return parts.length ? parts.join(", ") : "0 hours";
}
