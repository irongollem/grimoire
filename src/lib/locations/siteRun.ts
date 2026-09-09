// ── Site runner: pure derivations (#791, epic #780) ─────────────────────────
//
// `SiteRunSurface` answers two questions that are easy to get subtly wrong,
// so both live here — pure and colocated-tested — rather than inline in the
// component.

/** The shape `reachableRoomIds` needs from a `location_doors` row. Typed
 *  against the fields it actually reads, same convention as `SiblingOrder`
 *  in `lib/locations/tree.ts`, so a raw query row satisfies it structurally.
 *  `id` was added for #868's `unlockedDoorIds` — a locked door is looked up
 *  by it, not by the pair of endpoints, since two rooms may have more than
 *  one door between them. */
export interface DoorEdge {
  id: string;
  from_location_id: string;
  to_location_id: string;
  is_one_way: boolean;
  starts_locked: boolean;
}

/**
 * The room (if any) of `siteRoomIds` the party currently occupies.
 *
 * `campaigns.current_location_id` is the single source of the party's
 * position (see `lib/partyPosition.ts`) — this only asks whether that place
 * happens to be one of *this* site's rooms. It is `null` both when nobody
 * knows where the party is and when the party is somewhere else entirely —
 * the site itself rather than a named room, a different site, or nowhere at
 * all — and the surface treats every one of those the same way: there is no
 * "current room" to render.
 */
export function partyRoomInSite(
  campaignLocationId: string | null,
  siteRoomIds: readonly string[],
): string | null {
  if (campaignLocationId === null) return null;
  return siteRoomIds.includes(campaignLocationId) ? campaignLocationId : null;
}

/**
 * Every room reachable from `fromRoomId` by crossing doors that are not
 * `starts_locked` — or that are, but have since been unlocked in play —
 * following `is_one_way` direction where it applies. Includes `fromRoomId`
 * itself — the party is trivially "there" already.
 *
 * #791 read `starts_locked` alone because no live unlock fact existed yet;
 * #868 adds one (`location_state_events`' `unlocked` door fact) without
 * changing this function's shape, exactly as that story's comment predicted
 * — `unlockedDoorIds` is consulted only for a door that `starts_locked`,
 * never as a way to lock a door this table doesn't otherwise think is
 * locked. `starts_locked` itself stays authored prep and is never mutated by
 * play (see `types/locationDoor.types.ts`).
 *
 * A locked-and-not-yet-unlocked door is dropped from the graph in *both*
 * directions — whichever side the party is standing on, it has not been
 * opened from either side.
 */
export function reachableRoomIds(
  fromRoomId: string,
  doors: readonly DoorEdge[],
  unlockedDoorIds: ReadonlySet<string> = new Set(),
): Set<string> {
  const adjacency = new Map<string, string[]>();
  const addEdge = (from: string, to: string) => {
    const existing = adjacency.get(from);
    if (existing) existing.push(to);
    else adjacency.set(from, [to]);
  };
  for (const door of doors) {
    if (door.starts_locked && !unlockedDoorIds.has(door.id)) continue;
    addEdge(door.from_location_id, door.to_location_id);
    if (!door.is_one_way) addEdge(door.to_location_id, door.from_location_id);
  }

  const reached = new Set<string>([fromRoomId]);
  const queue: string[] = [fromRoomId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  return reached;
}
