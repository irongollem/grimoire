/**
 * Calendar adapter registry — now derived from the settings registry.
 * Add new settings in src/settings/index.ts rather than here.
 */
export {
  CALENDAR_REGISTRY,
  getCalendarAdapter,
  listCalendarAdapters,
  calendarDefToAdapter,
  createDefaultCustomCalendarDef,
} from "@/settings/index";

export { gregorianAdapter } from "./gregorian";
