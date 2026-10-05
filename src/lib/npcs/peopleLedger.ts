import type { SortDir } from "@/lib/noteSort";
import { sortPlayerNpcs, type PlayerNpcSortField } from "@/lib/npcs/playerNpcSort";
import type { NpcStatus, PlayerNpc } from "@/types/npc.types";

/**
 * A reveal before this never lands face down. Everything a player already had
 * stays in the ledger on release day, rather than the whole People page
 * turning into a wall of unopened cards (same idiom as FEATURE_LAUNCH in
 * `useReadItems`).
 */
export const NEW_TO_YOU_SINCE = new Date("2026-10-06T00:00:00Z");

export interface ClassifiedPeople {
  /** Revealed since launch and never opened: waiting to be turned. */
  faceDown: PlayerNpc[];
  /** Met under a cover identity, since unmasked, not yet opened afterwards. */
  unmasked: PlayerNpc[];
  /** Everyone else. People waiting to be turned stay out so the ledger cannot spoil the turn. */
  ledger: PlayerNpc[];
}

export function classifyPeople(
  npcs: readonly PlayerNpc[],
  readAt: ReadonlyMap<string, Date>,
): ClassifiedPeople {
  const out: ClassifiedPeople = { faceDown: [], unmasked: [], ledger: [] };
  for (const npc of npcs) {
    const read = readAt.get(npc.id);
    const revealed = npc.revealed_at ? new Date(npc.revealed_at) : null;
    const unmaskedAt = npc.unmasked_at ? new Date(npc.unmasked_at) : null;

    if (unmaskedAt && revealed && revealed < unmaskedAt && !(read && read >= unmaskedAt)) {
      out.unmasked.push(npc);
    } else if (revealed && revealed > NEW_TO_YOU_SINCE && !read) {
      out.faceDown.push(npc);
    } else {
      out.ledger.push(npc);
    }
  }
  return out;
}

/** Alive says nothing; every other status is named. */
export function statusWord(status: NpcStatus): string | null {
  if (status === "alive") return null;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export interface PeopleGroup {
  key: string;
  title: string | null;
  within: string | null;
  people: PlayerNpc[];
}

export interface PeopleGroupContext {
  getRating: (npcId: string) => number;
  /** The player-visible place, or null when the NPC's location is unknown or hidden. */
  place: (npc: PlayerNpc) => { id: string; name: string; within: string | null } | null;
  now?: Date;
}

const UNKNOWN_PLACE_KEY = "place:unknown";
const BEFORE_LEDGER_KEY = "day:none";

function localDayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function dayTitle(d: Date, now: Date): string {
  const base = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(d);
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/**
 * Group the ledger by the chosen sort. Days stand in for sessions until
 * sessions exist (issue #985); then "revealed" groups by session instead.
 * Never returns an empty group.
 */
export function buildPeopleGroups(
  npcs: readonly PlayerNpc[],
  field: PlayerNpcSortField,
  dir: SortDir,
  ctx: PeopleGroupContext,
): PeopleGroup[] {
  if (npcs.length === 0) return [];
  const sortCtx = {
    getRating: ctx.getRating,
    locationName: (npc: PlayerNpc) => ctx.place(npc)?.name ?? "",
  };

  if (field === "rating" || field === "name") {
    return [
      { key: field, title: null, within: null, people: sortPlayerNpcs(npcs, field, dir, sortCtx) },
    ];
  }

  if (field === "location") {
    const byPlace = new Map<string, { name: string; within: string | null; people: PlayerNpc[] }>();
    const unknown: PlayerNpc[] = [];
    for (const npc of npcs) {
      const place = ctx.place(npc);
      if (!place) {
        unknown.push(npc);
        continue;
      }
      const group = byPlace.get(place.id);
      if (group) group.people.push(npc);
      else byPlace.set(place.id, { name: place.name, within: place.within, people: [npc] });
    }
    const sign = dir === "asc" ? 1 : -1;
    const groups: PeopleGroup[] = [...byPlace.entries()]
      .sort(([, a], [, b]) => a.name.localeCompare(b.name) * sign)
      .map(([id, g]) => ({
        key: `place:${id}`,
        title: g.name,
        within: g.within,
        people: sortPlayerNpcs(g.people, "rating", "desc", sortCtx),
      }));
    if (unknown.length > 0) {
      groups.push({
        key: UNKNOWN_PLACE_KEY,
        title: "Whereabouts unknown",
        within: null,
        people: sortPlayerNpcs(unknown, "rating", "desc", sortCtx),
      });
    }
    return groups;
  }

  // "revealed": one group per local calendar day.
  const now = ctx.now ?? new Date();
  const byDay = new Map<string, { date: Date; people: PlayerNpc[] }>();
  const undated: PlayerNpc[] = [];
  for (const npc of npcs) {
    if (!npc.revealed_at) {
      undated.push(npc);
      continue;
    }
    const date = new Date(npc.revealed_at);
    const key = localDayKey(date);
    const group = byDay.get(key);
    if (group) group.people.push(npc);
    else byDay.set(key, { date, people: [npc] });
  }
  const sign = dir === "asc" ? 1 : -1;
  const groups: PeopleGroup[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b) * sign)
    .map(([key, g]) => ({
      key: `day:${key}`,
      title: dayTitle(g.date, now),
      within: null,
      people: sortPlayerNpcs(g.people, "revealed", "desc", sortCtx),
    }));
  if (undated.length > 0) {
    groups.push({
      key: BEFORE_LEDGER_KEY,
      title: "Before the ledger",
      within: null,
      people: sortPlayerNpcs(undated, "name", "asc", sortCtx),
    });
  }
  return groups;
}
