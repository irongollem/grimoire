import type { SortDir } from "@/lib/noteSort";
import { sortPlayerNpcs, type PlayerNpcSortField } from "@/lib/npcs/playerNpcSort";
import { sessionShortLabel } from "@/lib/sessions/sessionLabel";
import { formatSessionShortDay, playerSessionWhen } from "@/lib/sessions/sessionShortDay";
import type { NpcStatus, PlayerNpc } from "@/types/npc.types";
import type { PlayerSessionLabel } from "@/types/session.types";

/**
 * A reveal before this never lands face down. Everything a player already had
 * stays in the ledger on release day, rather than the whole People page
 * turning into a wall of unopened cards (same idiom as FEATURE_LAUNCH in
 * `useReadItems`).
 */
export const NEW_TO_YOU_SINCE = new Date("2026-10-06T00:00:00Z");

/** When, and in which session, a viewer first met an NPC. */
export interface RevealMoment {
  revealed_at: string;
  session_id: string | null;
}

/** The earliest reveal moment per NPC from a viewer's `npc_reveals` rows. */
export function earliestRevealPerNpc(
  rows: readonly { npc_id: string; revealed_at: string; session_id: string | null }[],
): Map<string, RevealMoment> {
  const earliest = new Map<string, RevealMoment>();
  for (const row of rows) {
    const seen = earliest.get(row.npc_id);
    if (!seen || Date.parse(row.revealed_at) < Date.parse(seen.revealed_at)) {
      earliest.set(row.npc_id, { revealed_at: row.revealed_at, session_id: row.session_id });
    }
  }
  return earliest;
}

/** The NPCs with the viewer's reveal moment set (null when they have none). */
export function withRevealMoments(
  npcs: readonly PlayerNpc[],
  moments: ReadonlyMap<string, RevealMoment>,
): PlayerNpc[] {
  return npcs.map((npc) => {
    const moment = moments.get(npc.id);
    return {
      ...npc,
      revealed_at: moment?.revealed_at ?? null,
      revealed_session_id: moment?.session_id ?? null,
    };
  });
}

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
  /** A trailing note on the head (a session's date); replaces the count when set. */
  end?: string | null;
  people: PlayerNpc[];
}

export interface PeopleGroupContext {
  getRating: (npcId: string) => number;
  /** The player-visible place, or null when the NPC's location is unknown or hidden. */
  place: (npc: PlayerNpc) => { id: string; name: string; within: string | null } | null;
  /** The session a reveal happened in, or null when it is not in the log. */
  sessionOf: (sessionId: string) => PlayerSessionLabel | null;
}

const UNKNOWN_PLACE_KEY = "place:unknown";
const BEFORE_LOG_KEY = "session:none";

/**
 * Group the ledger by the chosen sort. "Revealed" groups by the session the
 * viewer met the NPC in (#985). Never returns an empty group.
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

  // "revealed": one group per session, people outside any session last.
  const bySession = new Map<string, { session: PlayerSessionLabel; people: PlayerNpc[] }>();
  const beforeLog: PlayerNpc[] = [];
  for (const npc of npcs) {
    const session = npc.revealed_session_id ? ctx.sessionOf(npc.revealed_session_id) : null;
    if (!session) {
      beforeLog.push(npc);
      continue;
    }
    const group = bySession.get(session.id);
    if (group) group.people.push(npc);
    else bySession.set(session.id, { session, people: [npc] });
  }
  const sign = dir === "asc" ? 1 : -1;
  const groups: PeopleGroup[] = [...bySession.values()]
    .sort((a, b) => compareWhen(playerSessionWhen(a.session), playerSessionWhen(b.session)) * sign)
    .map(({ session, people }) => {
      const numbered = session.number !== null;
      const name = session.title?.trim() || null;
      return {
        key: `session:${session.id}`,
        title: numbered ? sessionShortLabel(session) : (name ?? "Unnumbered session"),
        within: numbered ? name : null,
        end: formatSessionShortDay(session),
        people: sortPlayerNpcs(people, "revealed", "desc", sortCtx),
      };
    });
  if (beforeLog.length > 0) {
    groups.push({
      key: BEFORE_LOG_KEY,
      title: "Before the log",
      within: null,
      people: sortPlayerNpcs(beforeLog, "name", "asc", sortCtx),
    });
  }
  return groups;
}

/** Orders two session moments; a session with no date at all sorts as oldest. */
function compareWhen(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1;
  return Date.parse(a) - Date.parse(b);
}
