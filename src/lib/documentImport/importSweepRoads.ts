import { normalizeEntityName } from "./entityName";
import type { NameLookupRow } from "./importPlan";
import { EXTRACTED_ROAD_GOINGS, type ExtractedRoad, type ExtractedRoadGoing } from "@/types/documentImport.types";

/** The most a road's distance may be, and the longest its name: `location_roads`' own checks. */
const MAX_DISTANCE = 100000;
const MAX_NAME = 120;

/** A `location_roads` row ready to insert; `user_id` is the column default. The database orders the two ends. */
export interface RoadWrite {
  campaign_id: string;
  from_location_id: string;
  to_location_id: string;
  distance: number;
  unit: "mi" | "km";
  /** "" for a road with no name, as the column holds it. */
  name: string;
  going: ExtractedRoadGoing;
  difficult: boolean;
}

/** A road whose far end matched no place of the sweep. */
export interface UnresolvedRoad {
  sourceId: string;
  name: string;
}

export interface PlannedRoads {
  writes: RoadWrite[];
  unresolved: UnresolvedRoad[];
}

/**
 * Model output is untrusted: keep the roads the database would accept and drop the rest, rather than let one bad
 * road refuse its whole batch. A distance is finite, above zero and within the column's ceiling (rounded to the
 * hundredths it stores); a name is trimmed and capped; a going the model invented becomes a plain road.
 */
export function cleanRoads(raw: unknown): ExtractedRoad[] {
  if (!Array.isArray(raw)) return [];
  const roads: ExtractedRoad[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.to_name !== "string" || r.to_name.trim() === "") continue;
    if (typeof r.distance !== "number" || !Number.isFinite(r.distance)) continue;
    const distance = Math.round(r.distance * 100) / 100;
    if (distance <= 0 || distance > MAX_DISTANCE) continue;
    if (r.unit !== "mi" && r.unit !== "km") continue;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, MAX_NAME) : "";
    const going = (EXTRACTED_ROAD_GOINGS as readonly unknown[]).includes(r.going) ? (r.going as ExtractedRoadGoing) : "road";
    roads.push({
      to_name: r.to_name.trim(),
      distance,
      unit: r.unit,
      ...(name === "" ? {} : { name }),
      going,
      difficult: r.difficult === true,
    });
  }
  return roads;
}

/**
 * Turns the roads each imported place states into `location_roads` rows, resolved against the same sweep-wide
 * location lookup the world links use. A page states one road from both towns' entries, and the table holds a
 * road once per pair and name, so the first statement wins and the second is dropped here rather than refused
 * by the database (an unnamed road would not even be refused: its name is empty, but still part of the key).
 * A road to itself, or to a place that matched nothing, is not written; the unmatched are reported.
 */
export function planRoads(
  rows: readonly { id: string; links: object }[],
  locations: readonly NameLookupRow[],
  campaignId: string,
): PlannedRoads {
  const byName = new Map<string, string>();
  for (const loc of locations) {
    const key = normalizeEntityName(loc.name);
    if (key !== null && !byName.has(key)) byName.set(key, loc.id);
  }

  const writes: RoadWrite[] = [];
  const unresolved: UnresolvedRoad[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const road of (row.links as { roads?: ExtractedRoad[] }).roads ?? []) {
      const key = normalizeEntityName(road.to_name);
      const toId = key === null ? undefined : byName.get(key);
      if (toId === undefined) {
        unresolved.push({ sourceId: row.id, name: road.to_name });
        continue;
      }
      if (toId === row.id) continue;
      const name = road.name?.trim() ?? "";
      const dedupe = `${[row.id, toId].sort().join("|")}|${name.toLowerCase()}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      writes.push({
        campaign_id: campaignId,
        from_location_id: row.id,
        to_location_id: toId,
        distance: road.distance,
        unit: road.unit,
        name,
        going: road.going,
        difficult: road.difficult,
      });
    }
  }
  return { writes, unresolved };
}
