/**
 * A route drawn on an Atlas map, and the travel event it becomes (#932).
 *
 * Routes are never saved: the calendar's travel event is the record. This
 * module is the pure half: the waypoint shape, the summary a panel shows
 * (distance, pace, time) and the prefill the event modal opens with. The
 * stateful half is `useMapMeasure`.
 */
import { addDays, type CalendarDate } from "@/lib/calendar/dayMath";
import { formatDistance, routeLength, type ImagePoint, type ImageSize } from "@/lib/locations/mapScale";
import { formatTravelTime, getTravelPace, travelTime, type TravelPaceId, type TravelTime } from "@/rules/travelPace";
import type { CalendarAdapter, CalendarEventInsert } from "@/types/calendar.types";
import type { MapScale } from "@/types/location.types";

/** The place a waypoint snapped to, when it was a tap on a pin. */
export interface RoutePin {
  id: string;
  name: string;
}

export interface RoutePoint extends ImagePoint {
  pin: RoutePin | null;
}

export interface RouteSummary {
  distance: number;
  unit: MapScale["unit"];
  paceId: TravelPaceId;
  time: TravelTime;
  /** The first and last waypoint's pins; null where the end is open ground. */
  from: RoutePin | null;
  to: RoutePin | null;
}

/**
 * What a route measures at a pace, or null while it cannot be measured: fewer
 * than two waypoints, or an image whose size is not yet known.
 */
export function summarizeRoute(
  points: readonly RoutePoint[],
  scale: MapScale,
  size: ImageSize,
  paceId: TravelPaceId,
): RouteSummary | null {
  if (points.length < 2) return null;
  const distance = routeLength(points, scale, size);
  if (distance === null) return null;
  return {
    distance,
    unit: scale.unit,
    paceId,
    time: travelTime(distance, scale.unit, paceId),
    from: points[0].pin,
    to: points[points.length - 1].pin,
  };
}

/** "Travel to Daggerford", or plain "Travel" when the route ends on open ground. */
export function routeTitle(summary: RouteSummary): string {
  return summary.to ? `Travel to ${summary.to.name}` : "Travel";
}

/** "84 mi from Waterdeep to Daggerford at a normal pace: 3 days, 4 hours." */
export function routeDescription(summary: RouteSummary): string {
  const from = summary.from ? ` from ${summary.from.name}` : "";
  const to = summary.to ? ` to ${summary.to.name}` : "";
  const pace = getTravelPace(summary.paceId).label.toLowerCase();
  return `${formatDistance(summary.distance, summary.unit)}${from}${to} at a ${pace} pace: ${formatTravelTime(summary.time)}.`;
}

/** The event fields a measured route fills in; the DM edits the rest. */
export type RouteEventPrefill = Pick<
  CalendarEventInsert,
  | "title"
  | "event_type"
  | "harptos_year"
  | "harptos_month"
  | "harptos_day"
  | "is_multi_day"
  | "end_year"
  | "end_month"
  | "end_day"
  | "linked_location_id"
  | "travel_party_member_ids"
>;

/**
 * The travel event for a route, starting on `start` (the campaign's in-world
 * today). A trip of a day or less stays a single-day event; a longer one spans
 * every calendar day it touches, so a 3 day, 4 hour trip is four days wide.
 * `addDays` walks the calendar's own months and rolls off intercalary days, so
 * the end date is right for Harptos as well as Gregorian.
 *
 * `travelerIds` are the party members standing at the origin pin: only they
 * are assumed to be going. Description text is the caller's to wrap, since the
 * stored format is Tiptap JSON.
 */
export function routeEventPrefill(
  summary: RouteSummary,
  start: CalendarDate,
  adapter: CalendarAdapter,
  travelerIds: readonly string[],
): RouteEventPrefill {
  const multiDay = summary.time.calendarDays > 1;
  const end = multiDay ? addDays(adapter, start, summary.time.calendarDays - 1) : null;
  return {
    title: routeTitle(summary),
    event_type: "travel",
    harptos_year: start.year,
    harptos_month: start.month,
    harptos_day: start.day,
    is_multi_day: multiDay,
    end_year: end?.year ?? null,
    end_month: end?.month ?? null,
    end_day: end?.day ?? null,
    linked_location_id: summary.to?.id ?? null,
    travel_party_member_ids: [...travelerIds],
  };
}
