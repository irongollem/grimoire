import { sortLore, type WorldDate } from "./canonLore";
import { sortSessionLog } from "@/lib/sessions/sessionPrefill";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CanonEntry, CanonForceTick } from "@/types/canon.types";
import type { CalendarEvent, CalendarEventType } from "@/types/calendar.types";
import type { Note } from "@/types/notes.types";
import type { CampaignSession } from "@/types/session.types";

/**
 * The Chronicle and the almanac (#1226, frame 12). A chronicle entry is not a row of its own: it is the note a session
 * is linked to (`notes.session_id`), so every function here starts from the session log and looks a note up for each
 * session, never the other way round. A note with no session is not chronicle and never shows.
 */

export interface ChronicleItem {
  session: CampaignSession;
  /** The session's note; its newest when several were linked. Null when none is written yet. */
  note: Note | null;
}

/** The sessions as chronicle entries, newest first: each with its note, or none yet. */
export function chronicleItems(sessions: readonly CampaignSession[], notes: readonly Note[]): ChronicleItem[] {
  const noteOf = new Map<string, Note>();
  for (const note of notes) {
    if (note.session_id === null) continue;
    const have = noteOf.get(note.session_id);
    if (have === undefined || note.updated_at > have.updated_at) noteOf.set(note.session_id, note);
  }
  return sortSessionLog(sessions).map((session) => ({ session, note: noteOf.get(session.id) ?? null }));
}

export type ChronicleOrder = "newest" | "start";

export function orderChronicle<T>(newestFirst: readonly T[], order: ChronicleOrder): T[] {
  return order === "newest" ? [...newestFirst] : [...newestFirst].reverse();
}

/** How many sessions have a chronicle entry written: the number the contents column shows. */
export function writtenCount(items: readonly ChronicleItem[]): number {
  return items.filter((item) => item.note !== null).length;
}

/** The date in the world the note carries for the session's start; all null when the note is undated or missing. */
export function sessionWorldDate(note: Note | null): WorldDate {
  if (note === null || note.session_start_year === null) return { year: null, month: null, day: null };
  return { year: note.session_start_year, month: note.session_start_month, day: note.session_start_day };
}

/** The first words of a note, cut at a word, for the entry's excerpt. Empty for a note with no text. */
export function chronicleExcerpt(content: string | null, max = 260): string {
  const text = tiptapToPlainText(content).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function findImage(node: unknown): string | null {
  if (typeof node !== "object" || node === null) return null;
  const n = node as { type?: unknown; attrs?: { src?: unknown }; content?: unknown };
  if (n.type === "image" && typeof n.attrs?.src === "string" && n.attrs.src !== "") return n.attrs.src;
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      const found = findImage(child);
      if (found !== null) return found;
    }
  }
  return null;
}

/** The first picture in a note (the Chronicler's illustrations land in the note as images), or null. */
export function firstNoteImage(content: string | null): string | null {
  if (!content) return null;
  try {
    return findImage(JSON.parse(content));
  } catch {
    return null; // legacy plain text has no pictures
  }
}

export type AlmanacKind = "lore" | "moving" | "session" | "calendar";

export interface AlmanacEvent {
  key: string;
  kind: AlmanacKind;
  title: string;
  date: WorldDate;
  /** A calendar event's own kind ("Festival", "Discovery"), the small word shown beside the date. Null for the other kinds. */
  word: string | null;
  /** Where it is edited: the lore entry, the force, the session's note, or the Calendar at that date. */
  to: { path: string; query?: Record<string, string> };
}

type Dated = { world_year: number | null; world_month: number | null; world_day: number | null };
const asDated = (date: WorldDate): Dated => ({ world_year: date.year, world_month: date.month, world_day: date.day });

/** The small word for a calendar event's type, as the Calendar's own filter and list name it. */
export const CALENDAR_TYPE_WORD: Record<CalendarEventType, string> = {
  campaign: "Campaign",
  world: "World",
  session: "Session",
  festival: "Festival",
  deadline: "Deadline",
  player_death: "A hero fell",
  boss_fight: "Boss fight",
  discovery: "Discovery",
  npc_death: "A death",
  travel: "Travel",
  quest: "Quest",
  encounter: "Encounter",
  location: "Place",
};

/** The Calendar page at a date: it opens the month grid on that year and month (`CalendarView` reads these two). */
export function calendarDateRoute(year: number, month: number | null): { path: string; query: Record<string, string> } {
  return { path: "/calendar", query: month === null ? { year: String(year) } : { year: String(year), month: String(month) } };
}

/** What a tick says: the DM's note, or which way the clock moved. */
export function tickTitle(forceTitle: string, tick: Pick<CanonForceTick, "note" | "delta">): string {
  const note = tick.note.trim();
  if (note !== "") return `${forceTitle}: ${note}`;
  return `${forceTitle} ${tick.delta > 0 ? "moved closer" : "fell back"}`;
}

/**
 * One timeline in the world's calendar: lore with a date in the world, force ticks that carry a world date, the Calendar's own events
 * (read, never copied; its session events are left out because every session is already here from its note), and every
 * session by the date its note gives. Dated events are in world order (a year with no month before a month, as the
 * lore list reads); a tie keeps lore, then ticks, then calendar events, then sessions. Sessions with no world date come last, oldest first,
 * so the almanac never hides an evening for want of a date. Undated lore and ticks are not part of it.
 */
export function almanac(input: {
  lore: readonly CanonEntry[];
  forces: readonly CanonEntry[];
  ticks: readonly CanonForceTick[];
  /** Newest first, as `chronicleItems` returns them. */
  items: readonly ChronicleItem[];
  /** The campaign's Calendar events. Left alone when omitted. Events of type `session` are never listed: each session already is one, from its note. */
  calendarEvents?: readonly CalendarEvent[];
}): AlmanacEvent[] {
  const forceTitle = new Map(input.forces.map((f) => [f.id, f.title]));
  const dated: (AlmanacEvent & Dated)[] = [];
  const undatedSessions: AlmanacEvent[] = [];

  for (const entry of input.lore) {
    if (entry.world_year === null) continue;
    const date = { year: entry.world_year, month: entry.world_month, day: entry.world_day };
    dated.push({ key: `lore:${entry.id}`, kind: "lore", title: entry.title, date, word: null, to: { path: "/canon", query: { entry: entry.id } }, ...asDated(date) });
  }
  for (const tick of input.ticks) {
    const forceName = forceTitle.get(tick.force_id);
    if (tick.world_year === null || forceName === undefined) continue;
    const date = { year: tick.world_year, month: tick.world_month, day: tick.world_day };
    dated.push({ key: `tick:${tick.id}`, kind: "moving", title: tickTitle(forceName, tick), date, word: null, to: { path: "/canon", query: { entry: tick.force_id } }, ...asDated(date) });
  }
  for (const event of input.calendarEvents ?? []) {
    // The session's own event is a mirror of its note's dates (useNoteCalendarSync); the note already makes it an entry.
    if (event.event_type === "session") continue;
    const date = { year: event.year, month: event.month, day: event.day };
    dated.push({ key: `calendar:${event.id}`, kind: "calendar", title: event.title, date, word: CALENDAR_TYPE_WORD[event.event_type], to: calendarDateRoute(event.year, event.month), ...asDated(date) });
  }
  for (const { session, note } of [...input.items].reverse()) {
    const date = sessionWorldDate(note);
    const title = note?.title.trim() || sessionLabel(session);
    const event: AlmanacEvent = { key: `session:${session.id}`, kind: "session", title, date, word: null, to: { path: note ? `/notes/${note.id}` : `/sessions/${session.id}` } };
    if (date.year === null) undatedSessions.push(event);
    else dated.push({ ...event, ...asDated(date) });
  }
  return [...sortLore(dated).map(({ world_year: _y, world_month: _m, world_day: _d, ...event }) => event), ...undatedSessions];
}
