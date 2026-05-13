/**
 * Settings registry — the single source of truth for all D&D campaign settings.
 *
 * Each setting is a DndSettingDef: a plain JSON-serializable object containing
 * the calendar definition, location presets, Hall of Heroes seed data, and a
 * default AI prompt. Custom DM settings can be fetched from blob storage and
 * registered at runtime via registerSetting().
 */

import type { CalendarAdapter } from "@/types/calendar.types";
import { toCalendarAdapter, calendarDefToAdapter } from "./types";
import type { SettingCalendarDef } from "./types";
import { faerunSetting }      from "./faerun";
import { eberronSetting }     from "./eberron";
import { greyhawkSetting }    from "./greyhawk";
import { dragonlanceSetting } from "./dragonlance";
import { ravenloftSetting }   from "./ravenloft";
import { planescapeSetting }  from "./planescape";
import { spelljammerSetting } from "./spelljammer";
import { darksunSetting }     from "./darksun";
import { mystaraSetting }     from "./mystara";

import type { DndSettingDef } from "./types";

// ── Registry ─────────────────────────────────────────────────────────────────

const SETTINGS_MAP = new Map<string, DndSettingDef>([
  [faerunSetting.id,      faerunSetting],
  [eberronSetting.id,     eberronSetting],
  [greyhawkSetting.id,    greyhawkSetting],
  [dragonlanceSetting.id, dragonlanceSetting],
  [ravenloftSetting.id,   ravenloftSetting],
  [planescapeSetting.id,  planescapeSetting],
  [spelljammerSetting.id, spelljammerSetting],
  [darksunSetting.id,     darksunSetting],
  [mystaraSetting.id,     mystaraSetting],
]);

/** Register a custom DM setting fetched at runtime from blob storage. */
export function registerSetting(def: DndSettingDef): void {
  SETTINGS_MAP.set(def.id, def);
}

/** List all registered settings (built-in + custom). */
export function listSettings(): DndSettingDef[] {
  return Array.from(SETTINGS_MAP.values());
}

/** Get a setting definition by ID, or undefined if not found. */
export function getSetting(id: string): DndSettingDef | undefined {
  return SETTINGS_MAP.get(id);
}

// ── Calendar adapter helpers ──────────────────────────────────────────────────

// Gregorian remains a standalone adapter (it's a real-world calendar, not a D&D setting).
import { gregorianAdapter } from "@/calendars/gregorian";

/** Registry of CalendarAdapters keyed by adapter ID — derived from settings + gregorian. */
export const CALENDAR_REGISTRY: Record<string, CalendarAdapter> = Object.fromEntries([
  ...Array.from(SETTINGS_MAP.values()).map((s) => [s.id, toCalendarAdapter(s)]),
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
  ...Array.from(SETTINGS_MAP.values()).map((s) => ({ value: s.id, label: s.label })),
  { value: "homebrew", label: "Homebrew" },
  { value: "other",    label: "Other"    },
] as const;

export type DndSettingValue = (typeof DND_SETTINGS)[number]["value"];

// ── Location presets ──────────────────────────────────────────────────────────

import type { SettingLocationDef } from "./types";

/** Location presets keyed by setting ID. */
export const SETTING_LOCATIONS: Record<string, SettingLocationDef[]> = Object.fromEntries(
  Array.from(SETTINGS_MAP.values()).map((s) => [
    s.id,
    s.locations,
  ]),
);

// ── Re-exports for backward compatibility ─────────────────────────────────────

export type { DndSettingDef, SettingCalendarDef } from "./types";
export {
  toCalendarAdapter,
  calendarDefToAdapter,
  createDefaultCustomCalendarDef,
  toHallOfHeroInserts,
} from "./types";
