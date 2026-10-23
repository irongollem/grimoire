/**
 * What the per-entry article layouts of the public book need and the book model does not hold (#1085): the
 * stored record behind an entry, the words for a person's standing, a map's visible pins, and the calendar
 * arithmetic behind the almanac. Pure data in, pure data out; no store, no router, no DOM.
 */

import { NPC_RELATIONSHIP_LABELS, type NpcRelationship } from "@/types/npc.types";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { CalendarAdapter } from "@/types/calendar.types";
import { getCalendarAdapter } from "@/settings";
import type { SettingCalendarDef } from "@/settings/types";
import { parseStoredContent } from "@/lib/tiptap/viewerRender";
import { daysInMonth } from "@/lib/calendar/dayMath";
import type { BookEntryRef } from "@/lib/openBook/bookModel";
import type {
  OpenBookCalendarDate,
  OpenBookDeity,
  OpenBookEvent,
  OpenBookFaction,
  OpenBookLore,
  OpenBookPantheon,
  OpenBookPerson,
  OpenBookPin,
  OpenBookPlace,
  OpenBookSession,
  OpenBookSnapshot,
} from "@/types/openBook.types";

// ── Records ─────────────────────────────────────────────────────────────────

export type ArticleRecord =
  | { kind: "place"; record: OpenBookPlace }
  | { kind: "person"; record: OpenBookPerson }
  | { kind: "faction"; record: OpenBookFaction }
  | { kind: "pantheon"; record: OpenBookPantheon }
  | { kind: "deity"; record: OpenBookDeity }
  | { kind: "lore"; record: OpenBookLore }
  | { kind: "session"; record: OpenBookSession };

/** The snapshot record an entry stands for, or null when the snapshot does not hold it. */
export function recordFor(snapshot: OpenBookSnapshot, entry: BookEntryRef): ArticleRecord | null {
  const same = <T extends { id: string }>(list: T[]): T | null => list.find((r) => r.id === entry.id) ?? null;
  switch (entry.kind) {
    case "place": {
      const record = same(snapshot.places);
      return record ? { kind: "place", record } : null;
    }
    case "person": {
      const record = same(snapshot.folk);
      return record ? { kind: "person", record } : null;
    }
    case "faction": {
      const record = same(snapshot.factions);
      return record ? { kind: "faction", record } : null;
    }
    case "pantheon": {
      const record = same(snapshot.pantheons);
      return record ? { kind: "pantheon", record } : null;
    }
    case "deity": {
      const record = same(snapshot.deities);
      return record ? { kind: "deity", record } : null;
    }
    case "lore": {
      const record = same(snapshot.lore);
      return record ? { kind: "lore", record } : null;
    }
    case "session": {
      const record = same(snapshot.sessions);
      return record ? { kind: "session", record } : null;
    }
  }
}

// ── Words ───────────────────────────────────────────────────────────────────

const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** 14 -> "XIV". Anything below 1 or beyond a sane book has no numeral, so it returns the plain number. */
export function romanNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  let rest = n;
  let out = "";
  for (const [value, glyph] of ROMAN) {
    while (rest >= value) {
      out += glyph;
      rest -= value;
    }
  }
  return out;
}

/** "drowned_town" -> "Drowned town". */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function placeTypeLabel(type: string | null): string | null {
  if (!type) return null;
  const known = (LOCATION_TYPE_LABELS as Record<string, string | undefined>)[type];
  return known ?? humanize(type);
}

export interface Standing {
  /** The relationship as a word. */
  label: string;
  /** The theme token its pigment diamond is painted with. */
  token: string;
}

function isRelationship(value: string): value is NpcRelationship {
  return value in NPC_RELATIONSHIP_LABELS;
}

/** How a person stands to the party: a word and the token for its diamond. Null when the book says nothing. */
export function standingOf(relationship: string | null): Standing | null {
  if (!relationship || !isRelationship(relationship)) return null;
  return { label: NPC_RELATIONSHIP_LABELS[relationship], token: `--relationship-${relationship}` };
}

const STATUS_WORDS: Record<string, string> = { dead: "Dead", missing: "Missing", unknown: "Unknown" };

/** Alive says nothing in a book; every other known status is named. */
export function statusLabel(status: string | null): string | null {
  return status ? (STATUS_WORDS[status] ?? null) : null;
}

/** "Session XIV" for a session with a number, else null. */
export function sessionRubric(session: OpenBookSession): string | null {
  const n = session.session?.number ?? null;
  return n === null ? null : `Session ${romanNumeral(n)}`;
}

/** "22 Oct 2026" from a date or timestamp string; null when it does not read as a date. */
export function formatPlayedOn(value: string | null): string | null {
  if (!value) return null;
  const when = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(when.getTime())) return null;
  return when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// ── Maps ────────────────────────────────────────────────────────────────────

export interface PlacePlate {
  url: string;
  /** True for a drawn map, whose pins sit on it; false for a plain picture of the place. */
  isMap: boolean;
}

/** The map's own picture, else its baked layer, else the place's picture; null when the place has none. */
export function placePlate(place: OpenBookPlace): PlacePlate | null {
  const map = place.map?.url ?? place.map?.layer_url ?? null;
  if (map) return { url: map, isMap: true };
  return place.image_url ? { url: place.image_url, isMap: false } : null;
}

export interface MapPoint {
  childId: string;
  name: string;
  /** Fractions of the map's width and height, 0 to 1. */
  x: number;
  y: number;
}

function fraction(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/** The pins a visitor may see, in the shape `MapPin` stores them; a pin that does not read cleanly is dropped. */
export function readPins(pins: OpenBookPin[]): MapPoint[] {
  const out: MapPoint[] = [];
  for (const pin of pins) {
    if (pin.visible_to_players === false) continue;
    const x = fraction(pin.x);
    const y = fraction(pin.y);
    const id = pin.child_location_id;
    const name = pin.child_name;
    if (x === null || y === null || typeof id !== "string" || typeof name !== "string" || !name) continue;
    out.push({ childId: id, name, x, y });
  }
  return out;
}

// ── Calendar ────────────────────────────────────────────────────────────────

function isCalendarDef(value: unknown): value is SettingCalendarDef {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  return Array.isArray(rec.months) && Array.isArray(rec.intercalaryDays) && typeof rec.name === "string";
}

/** The noun agreed with a count: "tale" for 1, "tales" otherwise. Irregular plurals are passed in. */
export function pluralize(n: number, one: string, many: string = `${one}s`): string {
  return n === 1 ? one : many;
}

/** "1 tale", "4 tales". */
export function countLabel(n: number, one: string, many?: string): string {
  return `${n} ${pluralize(n, one, many)}`;
}

/** The campaign's calendar as the app builds it, or null when the snapshot names none. */
export function calendarAdapterFor(calendar: OpenBookSnapshot["calendar"]): CalendarAdapter | null {
  if (calendar.calendar_id === null) return isCalendarDef(calendar.custom_calendar) ? getCalendarAdapter("custom", calendar.custom_calendar) : null;
  return getCalendarAdapter(calendar.calendar_id, isCalendarDef(calendar.custom_calendar) ? calendar.custom_calendar : null);
}

/** "23 Brine, Year 312 AY"; the year alone when the month or day is missing; null with no year. */
export function formatCalendarDate(
  date: Pick<OpenBookCalendarDate, "year" | "month" | "day"> | null,
  adapter: CalendarAdapter | null,
): string | null {
  if (!date || date.year === null) return null;
  const epoch = adapter ? ` ${adapter.epochName}` : "";
  const month = date.month !== null ? adapter?.months[date.month - 1]?.name : undefined;
  if (month && date.day !== null) return `${date.day} ${month}, Year ${date.year}${epoch}`;
  if (month) return `${month}, Year ${date.year}${epoch}`;
  return `Year ${date.year}${epoch}`;
}

export interface MonthRef {
  year: number;
  month: number;
}

const monthKey = (m: MonthRef): number => m.year * 1000 + m.month;

/** One step through the calendar's months, rolling the year at either end. */
export function stepMonth(adapter: CalendarAdapter, from: MonthRef, by: 1 | -1): MonthRef {
  const count = adapter.months.length;
  const next = from.month + by;
  if (next < 1) return { year: from.year - 1, month: count };
  if (next > count) return { year: from.year + 1, month: 1 };
  return { year: from.year, month: next };
}

export interface MarkedDay {
  day: number;
  /** What happened on that day: event titles and sessions. */
  titles: string[];
  /** The session held that day, when one was. */
  sessionId: string | null;
}

/** Every dated thing in the book that lands on a month: events (multi-day spans included) and sessions. */
export function markedDays(
  adapter: CalendarAdapter,
  view: MonthRef,
  events: OpenBookEvent[],
  sessions: OpenBookSession[],
): Map<number, MarkedDay> {
  const last = daysInMonth(adapter, view.year, view.month);
  const days = new Map<number, MarkedDay>();
  const mark = (day: number, title: string, sessionId: string | null) => {
    if (day < 1 || day > last) return;
    const entry = days.get(day) ?? { day, titles: [], sessionId: null };
    entry.titles.push(title);
    if (sessionId) entry.sessionId = sessionId;
    days.set(day, entry);
  };

  for (const ev of events) {
    if (ev.year === null || ev.month === null || ev.day === null) continue;
    const start: MonthRef = { year: ev.year, month: ev.month };
    const end: MonthRef =
      ev.is_multi_day && ev.end_year !== null && ev.end_month !== null ? { year: ev.end_year, month: ev.end_month } : start;
    if (monthKey(view) < monthKey(start) || monthKey(view) > monthKey(end)) continue;
    const from = monthKey(view) === monthKey(start) ? ev.day : 1;
    const to = monthKey(view) === monthKey(end) ? (ev.is_multi_day ? (ev.end_day ?? ev.day) : ev.day) : last;
    for (let day = from; day <= to; day++) mark(day, ev.title, null);
  }
  for (const s of sessions) {
    const d = s.date;
    if (!d || d.year !== view.year || d.month !== view.month || d.day === null) continue;
    const n = s.session?.number ?? null;
    mark(d.day, n === null ? s.title : `Session ${n}`, s.id);
  }
  return days;
}

/** Festival (intercalary) events of a year: they have a name, not a month and day. */
export function festivalsOf(events: OpenBookEvent[], year: number): OpenBookEvent[] {
  return events.filter((e) => e.year === year && e.festival_day !== null);
}

/** The first and last month anything in the book is dated to, today included; null when nothing is dated. */
export function monthRange(
  events: OpenBookEvent[],
  sessions: OpenBookSession[],
  current: OpenBookSnapshot["calendar"]["current"],
): { first: MonthRef; last: MonthRef } | null {
  const months: MonthRef[] = [];
  for (const e of events) if (e.year !== null && e.month !== null) months.push({ year: e.year, month: e.month });
  for (const s of sessions) {
    const d = s.date;
    if (d && d.year !== null && d.month !== null) months.push({ year: d.year, month: d.month });
  }
  if (current.year !== null && current.month !== null) months.push({ year: current.year, month: current.month });
  if (months.length === 0) return null;
  const sorted = [...months].sort((a, b) => monthKey(a) - monthKey(b));
  return { first: sorted[0]!, last: sorted[sorted.length - 1]! };
}

export interface MonthGrid {
  /** Empty cells before day 1. */
  leading: number;
  days: number;
  /** One label per column; an empty list when the calendar has none. */
  columns: string[];
  columnCount: number;
}

export function monthGrid(adapter: CalendarAdapter, view: MonthRef): MonthGrid {
  const columnCount = adapter.weekSize;
  const labels = adapter.dayLabels ?? [];
  return {
    leading: adapter.weekdayOffset?.(view.year, view.month) ?? 0,
    days: daysInMonth(adapter, view.year, view.month),
    columns: labels.length === columnCount ? labels : Array.from({ length: columnCount }, (_, i) => ordinal(i + 1)),
    columnCount,
  };
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
}

// ── A session's lead picture ────────────────────────────────────────────────

export interface LeadImage {
  src: string;
  alt: string | null;
}

export interface SplitLead {
  leadImage: LeadImage | null;
  /** The stored document with the lead picture taken out, or what was stored when it holds none. */
  docWithoutIt: unknown;
}

type Json = Record<string, unknown>;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function usableSrc(value: unknown): value is string {
  return typeof value === "string" && /^(https?:\/\/|\/(?!\/))/i.test(value.trim());
}

/** Depth-first: the first usable image of a node list, with the list rebuilt without it (and without a parent it emptied). */
function takeFirstImage(nodes: unknown[]): { image: LeadImage; rest: unknown[] } | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!isJson(node)) continue;
    const attrs = isJson(node.attrs) ? node.attrs : {};
    if (node.type === "image" && usableSrc(attrs.src)) {
      const alt = typeof attrs.alt === "string" && attrs.alt.trim() !== "" ? attrs.alt : null;
      return { image: { src: attrs.src, alt }, rest: [...nodes.slice(0, i), ...nodes.slice(i + 1)] };
    }
    if (Array.isArray(node.content)) {
      const inner = takeFirstImage(node.content);
      if (inner) {
        const next = inner.rest.length === 0 && node.type !== "doc" ? [] : [{ ...node, content: inner.rest }];
        return { image: inner.image, rest: [...nodes.slice(0, i), ...next, ...nodes.slice(i + 1)] };
      }
    }
  }
  return null;
}

/**
 * A session report's first picture is its lead plate, shown big under the title. This pulls it out of the stored
 * content so it is not printed twice; a report with no usable image comes back as it was.
 */
export function splitLeadImage(content: object | string | null | undefined): SplitLead {
  const doc = parseStoredContent(content);
  if (!isJson(doc) || !Array.isArray(doc.content)) return { leadImage: null, docWithoutIt: doc };
  const found = takeFirstImage(doc.content);
  if (!found) return { leadImage: null, docWithoutIt: doc };
  return { leadImage: found.image, docWithoutIt: { ...doc, content: found.rest } };
}
