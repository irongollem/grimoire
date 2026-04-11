/**
 * Calendar adapter registry — now derived from the settings registry.
 * Add new settings in src/settings/index.ts rather than here.
 */
export {
  CALENDAR_REGISTRY,
  getCalendarAdapter,
  listCalendarAdapters,
} from "@/settings/index";

export { gregorianAdapter } from "./gregorian";
