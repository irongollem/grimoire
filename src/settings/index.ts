/**
 * Settings registry: the light, eager half of every built-in campaign setting
 * (id, label, calendar). It is small enough to ship in the boot graph, which
 * the calendar store, the campaign switcher and every picker read synchronously.
 *
 * The heavy half (locations, factions, heroes, pantheons, deities, the default
 * AI prompt) is about 300 kB of seed text in `src/settings/<id>.ts`. It lives in
 * `./content`, one lazily fetched chunk per setting, and must never be imported
 * from here: a static import of any content module would put all nine back into
 * the first paint, which is the regression this split exists to prevent.
 */

import type { CalendarAdapter } from "@/types/calendar.types";
import { calendarDefToAdapter } from "./types";
import type { SettingCalendarDef, SettingMeta } from "./types";
import { FAERUN_CALENDAR } from "./faerun.calendar";
import { EBERRON_CALENDAR } from "./eberron.calendar";
import { GREYHAWK_CALENDAR } from "./greyhawk.calendar";
import { DRAGONLANCE_CALENDAR } from "./dragonlance.calendar";
import { RAVENLOFT_CALENDAR } from "./ravenloft.calendar";
import { PLANESCAPE_CALENDAR } from "./planescape.calendar";
import { SPELLJAMMER_CALENDAR } from "./spelljammer.calendar";
import { DARKSUN_CALENDAR } from "./darksun.calendar";
import { MYSTARA_CALENDAR } from "./mystara.calendar";
// Gregorian remains a standalone adapter (it's a real-world calendar, not a D&D setting).
import { gregorianAdapter } from "@/settings/gregorian.calendar";

// ── Registry ─────────────────────────────────────────────────────────────────

const SETTING_METAS: readonly SettingMeta[] = [
  { id: "faerun",      label: "Forgotten Realms", calendar: FAERUN_CALENDAR },
  { id: "eberron",     label: "Eberron",          calendar: EBERRON_CALENDAR },
  { id: "greyhawk",    label: "Greyhawk",         calendar: GREYHAWK_CALENDAR },
  { id: "dragonlance", label: "Dragonlance",      calendar: DRAGONLANCE_CALENDAR },
  { id: "ravenloft",   label: "Ravenloft",        calendar: RAVENLOFT_CALENDAR },
  { id: "planescape",  label: "Planescape",       calendar: PLANESCAPE_CALENDAR },
  { id: "spelljammer", label: "Spelljammer",      calendar: SPELLJAMMER_CALENDAR },
  { id: "darksun",     label: "Dark Sun",         calendar: DARKSUN_CALENDAR },
  { id: "mystara",     label: "Mystara",          calendar: MYSTARA_CALENDAR },
];

const SETTING_METAS_BY_ID = new Map(SETTING_METAS.map((s) => [s.id, s]));

/** List every built-in setting's light metadata. */
export function listSettings(): readonly SettingMeta[] {
  return SETTING_METAS;
}

/** Get a setting's light metadata by ID, or undefined if it is not a built-in. */
export function getSetting(id: string): SettingMeta | undefined {
  return SETTING_METAS_BY_ID.get(id);
}

// ── Calendar adapter helpers ──────────────────────────────────────────────────

/** Registry of CalendarAdapters keyed by adapter ID — derived from settings + gregorian. */
export const CALENDAR_REGISTRY: Record<string, CalendarAdapter> = Object.fromEntries([
  ...SETTING_METAS.map((s) => [s.id, calendarDefToAdapter(s.id, s.calendar)]),
  ["gregorian", gregorianAdapter],
]);

/** Get a CalendarAdapter by ID, falling back to Faerûn.
 *  Pass a `customDef` to resolve id === 'custom' to a runtime adapter built from that JSON. */
export function getCalendarAdapter(id: string, customDef?: SettingCalendarDef | null): CalendarAdapter {
  if (id === "custom" && customDef) {
    return calendarDefToAdapter("custom", customDef);
  }
  return CALENDAR_REGISTRY[id] ?? CALENDAR_REGISTRY["faerun"]!;
}

/** List all available CalendarAdapters. */
export function listCalendarAdapters(): CalendarAdapter[] {
  return Object.values(CALENDAR_REGISTRY);
}

// ── DND_SETTINGS list (for pickers / dropdowns) ───────────────────────────────

/** Canonical list of settings for UI pickers. Includes freeform entries. */
export const DND_SETTINGS = [
  ...SETTING_METAS.map((s) => ({ value: s.id, label: s.label })),
  { value: "homebrew", label: "Homebrew" },
  { value: "other",    label: "Other"    },
] as const;

export type DndSettingValue = (typeof DND_SETTINGS)[number]["value"];

export type { SettingMeta, SettingContentDef, SettingCalendarDef } from "./types";
export { calendarDefToAdapter, createDefaultCustomCalendarDef } from "./types";
