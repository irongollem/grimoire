// The party's journeys at the AI table (#1222, story 8).
//
// The narrator asks how far it is before it tells a journey, the way a Dungeon Master looks at the map: the roads
// of the campaign answer with the distance, the days at a pace by the book, and the places the road passes. What
// happens on the way is the narrator's own call, as it is a human Dungeon Master's (the maintainer, 18 Nov 2026):
// not a flat chance per day but a matter of pacing, and a stop may be a quest's beat as well as a chance meeting.
// So this tool only says what the road is; it moves nobody, and `go_to` still does the arriving.
//
// Pure: the rules are the app's own (`src/lib/travel/way.ts`, `src/rules/travelPace.ts`), shared with the place's
// entry, so the table and the Atlas can never disagree about how far two towns are apart.

import { placesPassed, roadPlaceOf, shortestWay, type Way } from "../../../../src/lib/travel/way.ts";
import type { Road } from "../../../../src/lib/travel/roads.ts";
import { rationsNeeded } from "../../../../src/rules/rations.ts";
import { DEFAULT_TRAVEL_PACE, formatTravelTime, fromMiles, getTravelPace, journeyTime, TRAVEL_PACES, type TravelPaceId } from "../../../../src/rules/travelPace.ts";
import { tablesAlong, tablesLine, type PlacedTable, type TableOnTheWay } from "./roadTables.ts";
import type { AgentTool } from "./types.ts";
import { UUID_RE } from "./parse.ts";

export const TRAVEL_TOOL_NAME = "travel";

export const TRAVEL_TOOL: AgentTool = {
  name: TRAVEL_TOOL_NAME,
  description:
    "Says how far it is from where the party is to another place of this campaign, by the campaign's own roads: the " +
    "distance, how long it takes at a pace, and the places the road passes. Call it before you tell any journey " +
    "between two settlements or across country, and never invent a distance or a number of days yourself. It moves " +
    "nobody and passes no time: tell the journey, then call pass_days with the days it took and go_to when the " +
    "party arrives. What happens on the way is yours to decide, " +
    "as a Dungeon Master does, at each place the road passes and at each night's camp: a chance meeting or a fight " +
    "(start_fight), a scene at the camp fire, a beat of a quest in play that has no fixed place (a glimpse of the " +
    "one they hunt, a messenger who finds them), or nothing at all. Go by pacing, not by a quota: a journey meant to " +
    "feel long and hard has more on it, and one that follows an eventful stretch is quiet and told in a sentence or " +
    "two. Whatever follows the party catches up with it on the road. When something at a stop needs the player's " +
    "answer (someone bars the way, a stranger asks something, a fight), the journey halts there: call pass_days " +
    "with only the days so far, do not call go_to, end your reply at that stop, and let the party arrive in a " +
    "later reply once it is settled.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["to_place_id"],
    properties: {
      to_place_id: { type: "string", description: "The id of the place the party is going to." },
      pace: { type: "string", enum: TRAVEL_PACES.map((p) => p.id), description: "How the party travels. Normal unless the story says they hurry or go carefully." },
    },
  },
};


function tablesOfTheWay(way: Way, map: TravelMap, parentOf: (id: string) => string | null, nameOf: (id: string) => string): TableOnTheWay[] {
  const onRoads = way.legs.flatMap((leg): TableOnTheWay[] => {
    const own = map.roadTables.find((r) => r.roadId === leg.roadId);
    return own === undefined ? [] : [{ table: { ...own.table, placeId: "" }, forPlace: `the road from ${nameOf(leg.from)} to ${nameOf(leg.to)}` }];
  });
  const [first] = way.legs;
  const places = first === undefined ? [] : [first.from, ...way.legs.map((leg) => leg.to)];
  const seen = new Set<string>();
  return [...onRoads, ...tablesAlong(places, parentOf, nameOf, map.tables)].filter((found) => {
    if (seen.has(found.table.id)) return false;
    seen.add(found.table.id);
    return true;
  });
}

/** What a campaign that counts food is told about a journey: the need, and the book's price for going without. */
function foodLine(days: number, ruleset: "2014" | "2024"): string {
  const need = rationsNeeded(days, 1);
  const without = ruleset === "2014"
    ? "by the 2014 rules a character can go 3 + their Constitution modifier days without food (at least 1) and then takes one level of exhaustion at the end of each further day"
    : "by the 2024 rules eating nothing for five days gives one Exhaustion level at the end of the fifth day and one more each day after";
  return `This campaign counts food: the journey takes ${need} ${need === 1 ? "ration" : "rations"} for each traveller. Look at what the character carries, take what they eat from their pack as the days pass, and if the food runs short say so and let them decide; ${without}.`;
}

export type ParsedTravel = { ok: true; value: { toPlaceId: string; paceId: TravelPaceId } } | { ok: false; error: string };

export function parseTravel(input: Record<string, unknown>): ParsedTravel {
  const to = input.to_place_id;
  if (typeof to !== "string" || !UUID_RE.test(to)) return { ok: false, error: "to_place_id must be the id of a place of this campaign." };
  const pace = input.pace;
  if (pace !== undefined && !TRAVEL_PACES.some((p) => p.id === pace)) return { ok: false, error: `pace must be one of ${TRAVEL_PACES.map((p) => p.id).join(", ")}.` };
  return { ok: true, value: { toPlaceId: to, paceId: pace === undefined ? DEFAULT_TRAVEL_PACE : (pace as TravelPaceId) } };
}

/** A place as the journey needs it: its name and what it lies inside. */
export interface TravelPlace {
  id: string;
  name: string;
  parentId: string | null;
}

export interface TravelMap {
  places: readonly TravelPlace[];
  roads: readonly Road[];
  /** The roll tables the DM placed on places of the campaign (`roadTables.ts`). */
  tables: readonly PlacedTable[];
  /**
   * The edition whose food rules this campaign plays by, when it has the optional rule "Rations on the Road" on;
   * null when it does not count food (most tables), or plays no edition the rule is written for.
   */
  food: "2014" | "2024" | null;
  /** The tables roads name as their own (`location_roads.roll_table_id`), by road. */
  roadTables: readonly { roadId: string; table: Omit<PlacedTable, "placeId"> }[];
}

/** Every table of the campaign the narrator may roll on: those on places and those roads name. */
export function rollableTables(map: TravelMap): PlacedTable[] {
  return [...map.tables, ...map.roadTables.map((r) => ({ ...r.table, placeId: "" }))];
}

/**
 * What the narrator is told about the way from where the party is to a place. Always an answer it can tell from:
 * when the roads do not say, it is told so and to keep the journey vague rather than make up a number.
 */
export function travelAnswer(fromId: string | null, toId: string, paceId: TravelPaceId, map: TravelMap): { content: string; isError: boolean } {
  const byId = new Map(map.places.map((p) => [p.id, p]));
  const to = byId.get(toId);
  if (to === undefined) return { content: "No place of this campaign has that id. Find the place with search first.", isError: true };
  if (fromId === null || !byId.has(fromId)) return { content: "Where the party is has not been set. Call go_to for the place they are in first.", isError: true };
  const parentOf = (id: string): string | null => byId.get(id)?.parentId ?? null;
  const nameOf = (id: string): string => byId.get(id)?.name ?? "a place";
  const start = roadPlaceOf(fromId, parentOf, map.roads);
  const end = roadPlaceOf(toId, parentOf, map.roads);
  const unknown = `The campaign's roads do not say how far it is from ${nameOf(fromId)} to ${to.name}. Tell the journey without a distance or a number of days of your own; "some days" is as exact as you may be.`;
  if (start === null || end === null) return { content: unknown, isError: false };
  if (start === end) return { content: `${to.name} is in or at ${nameOf(start)}, where the party already is: there is no journey to tell. Call go_to when they get there.`, isError: false };
  const way = shortestWay(start, end, map.roads);
  if (way === null) return { content: unknown, isError: false };

  // Written in kilometres only when every road of the way is, as the place's entry writes it.
  const roadById = new Map(map.roads.map((road) => [road.id, road]));
  const unit = way.legs.every((leg) => roadById.get(leg.roadId)?.unit === "km") ? "km" : "mi";
  const distance = Math.round(fromMiles(way.miles, unit) * 10) / 10;
  // Difficult going (a pass, a bog) halves a day's distance, leg by leg (#1222).
  const time = journeyTime(way.legs, paceId);
  const hard = Math.round(fromMiles(way.legs.filter((leg) => leg.difficult).reduce((sum, leg) => sum + leg.miles, 0), unit) * 10) / 10;
  const pace = getTravelPace(paceId);
  const passed = placesPassed(way).map(nameOf);
  // A night is spent on the road after each full day of travel that is not the last stretch into the destination.
  const nights = Math.max(0, time.calendarDays - 1);
  const lines = [
    `By road from ${nameOf(start)} to ${nameOf(end)}: ${distance} ${unit}, ${formatTravelTime(time)} of travel at a ${pace.label.toLowerCase()} pace (${time.calendarDays} ${time.calendarDays === 1 ? "day" : "days"} on the calendar).`,
    ...(hard > 0 ? [`${hard} ${unit} of it is difficult going, which halves a day's distance there.`] : []),
    passed.length === 0 ? "The road passes no other place of the campaign." : `The road passes ${passed.join(", then ")}.`,
    nights === 0 ? "They arrive the same day: no night on the road." : `${nights} ${nights === 1 ? "night" : "nights"} on the road.`,
    // The tables for this journey: each road's own first (the road is where the party is between two places),
    // then those that hold for where it starts, what it passes and where it ends. A table is listed once.
    ...[tablesLine(tablesOfTheWay(way, map, parentOf, nameOf))].filter((line): line is string => line !== null),
    ...(map.food === null ? [] : [foodLine(time.calendarDays, map.food)]),
    `When they arrive, call pass_days with ${time.calendarDays} and go_to with ${toId}.`,
  ];
  return { content: lines.join("\n"), isError: false };
}
