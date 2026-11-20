// What day it is in the story (#1021). Pure: no I/O.
//
// The date changes in play (the table moves the calendar on), so it is per-turn state at the head of the newest
// message, never standing text. It is worded as the campaign's own calendar names it, through the same formatter the
// Calendar page uses, so the Narrator and the DM read one date.

import { getCalendarAdapter } from "../../../../src/settings/index.ts";
import type { SettingCalendarDef } from "../../../../src/settings/types.ts";
import { campaignToday } from "../npcAge.ts";

/** The calendar-bearing columns of a `campaigns` row. */
export interface CampaignDateColumns {
  current_year?: unknown;
  current_month?: unknown;
  current_day?: unknown;
  calendar_id?: unknown;
  custom_calendar?: unknown;
}

/** Words any day of the campaign's calendar the way the Calendar page does; the calendar is the campaign's own. */
export function dateTextFor(row: CampaignDateColumns | null): (year: number, month: number, day: number) => string {
  const id = row !== null && typeof row.calendar_id === "string" ? row.calendar_id : null;
  const custom = row !== null && typeof row.custom_calendar === "object" && row.custom_calendar !== null ? (row.custom_calendar as SettingCalendarDef) : null;
  // Resolved on the first day asked for, so a malformed custom calendar fails where the day is worded (and costs that
  // line), not where the formatter is made.
  return (year, month, day) => getCalendarAdapter(id, custom).formatDate(year, month, day, null);
}

/**
 * The campaign's date as its calendar names it, or null when the campaign has no date set (a missing part is no date,
 * never "Day 0"). A campaign with no calendar chosen reads as the blank calendar, as everywhere else in the app.
 */
export function todayText(row: CampaignDateColumns | null): string | null {
  const date = campaignToday(row);
  if (date === null || row === null) return null;
  return dateTextFor(row)(date.year, date.month, date.day);
}

/** The state line; empty (the section is absent) with no date. */
export function todaySection(text: string | null | undefined): string {
  if (text === null || text === undefined || text.trim() === "") return "";
  return `## Today\n\nToday is ${text.trim()}.`;
}
