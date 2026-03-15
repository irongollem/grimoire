import type { CalendarEventType } from "@/types/calendar.types";

export interface BundleEvent {
  title: string;
  description: string;
  event_type: CalendarEventType;
  harptos_year: number;
  harptos_month: number | null;
  harptos_day: number | null;
  festival_day: string | null;
  is_multi_day: boolean;
  end_year: number | null;
  end_month: number | null;
  end_day: number | null;
  color: string;
}

export interface SettingBundle {
  calendarId: string;   // matches CalendarAdapter.id
  name: string;
  description: string;
  events: BundleEvent[];
}

import faerunBundle from "./faerun";
import greyhawkBundle from "./greyhawk";
import eberronBundle from "./eberron";
import dragonlanceBundle from "./dragonlance";

/** Registry of all setting bundles, keyed by calendar adapter ID */
export const SETTING_BUNDLES: Record<string, SettingBundle> = {
  faerun: faerunBundle,
  greyhawk: greyhawkBundle,
  eberron: eberronBundle,
  dragonlance: dragonlanceBundle,
};
