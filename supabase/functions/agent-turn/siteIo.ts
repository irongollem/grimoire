// The database half of site state at the AI table (#1021): what has become true of the party's place and its rooms.
//
// `location_state` (the newest assertion per place, door and fact) has no campaign column, so the place ids are read
// first from `locations` with the campaign filter, and the state is asked only for those. The doors' names come from
// `location_doors`, asked only for door ids that came out of that campaign-scoped state. Read as the service role,
// like the scene, so the campaign filter on the first query is the whole fence. The rules are in `_shared/agent/site.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { DOOR_FACTS, PLACE_FACTS, type DoorFact, type PlaceFact, NO_SITE, type SiteState } from "../_shared/agent/site.ts";

type Row = Record<string, unknown>;

/** A read's rows: a body that is not a list is a failed read, never "no rows". */
function listOf(data: unknown): Row[] {
  if (!Array.isArray(data)) throw new Error("expected a list of rows");
  return data as Row[];
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/** How many rooms inside the place are read. Beyond it, the scene itself says there are more. */
const ROOMS_READ = 40;

export async function loadSiteState(client: SupabaseClient, campaignId: string, locationId: string): Promise<SiteState> {
  const place = await client.from("locations").select("id, name, parent_id").eq("id", locationId).eq("campaign_id", campaignId).maybeSingle();
  if (place.error) throw place.error;
  if (!place.data) return NO_SITE;
  const here = place.data as Row;
  const rooms = await client.from("locations").select("id, name").eq("parent_id", locationId).eq("campaign_id", campaignId)
    .order("name", { ascending: true }).limit(ROOMS_READ);
  if (rooms.error) throw rooms.error;
  const named = new Map<string, string>([[locationId, here.name as string]]);
  for (const r of listOf(rooms.data)) named.set(r.id as string, r.name as string);
  // A door is logged against the site its two rooms share: the party's place when it is the site, else the place it lies in.
  const siteId = typeof here.parent_id === "string" ? here.parent_id : locationId;
  const ids = [...new Set([...named.keys(), siteId])];

  const state = await client.from("location_state").select("location_id, fact, value, door_id").in("location_id", ids).eq("value", true);
  if (state.error) throw state.error;
  const rows = listOf(state.data);

  const placeFacts = new Map<string, PlaceFact[]>();
  const doorFacts = new Map<string, DoorFact[]>();
  for (const r of rows) {
    const fact = r.fact as string;
    if (typeof r.door_id === "string") {
      // Only the doors of the site the party stands in or inside.
      if (r.location_id !== siteId || !(DOOR_FACTS as readonly string[]).includes(fact)) continue;
      push(doorFacts, r.door_id, fact as DoorFact);
    } else if ((PLACE_FACTS as readonly string[]).includes(fact) && named.has(r.location_id as string)) {
      push(placeFacts, r.location_id as string, fact as PlaceFact);
    }
  }

  const labels = new Map<string, string>();
  if (doorFacts.size > 0) {
    const doors = await client.from("location_doors").select("id, label").in("id", [...doorFacts.keys()]);
    if (doors.error) throw doors.error;
    for (const d of listOf(doors.data)) labels.set(d.id as string, typeof d.label === "string" ? d.label : "");
  }

  return {
    // The party's own place first, then its rooms by name.
    places: [...named].flatMap(([id, name]) => {
      const facts = placeFacts.get(id);
      return facts === undefined ? [] : [{ name, facts }];
    }),
    // A door whose row could not be found is not told: there is no name to say it under.
    doors: [...doorFacts].flatMap(([id, facts]) => {
      const label = labels.get(id);
      return label === undefined ? [] : [{ label, facts }];
    }),
  };
}
