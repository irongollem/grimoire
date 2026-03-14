import type { CalendarAdapter } from "@/types/calendar.types";
import { faerunAdapter } from "./faerun";
import { gregorianAdapter } from "./gregorian";
import { greyhawkAdapter } from "./greyhawk";
import { eberronAdapter } from "./eberron";
import { dragonlanceAdapter } from "./dragonlance";

// Registry — add new adapters here. The key must match CalendarAdapter.id.
export const CALENDAR_REGISTRY: Record<string, CalendarAdapter> = {
  faerun: faerunAdapter,
  gregorian: gregorianAdapter,
  greyhawk: greyhawkAdapter,
  eberron: eberronAdapter,
  dragonlance: dragonlanceAdapter,
};

export function getCalendarAdapter(id: string): CalendarAdapter {
  return CALENDAR_REGISTRY[id] ?? faerunAdapter;
}

export function listCalendarAdapters(): CalendarAdapter[] {
  return Object.values(CALENDAR_REGISTRY);
}

export { faerunAdapter };
