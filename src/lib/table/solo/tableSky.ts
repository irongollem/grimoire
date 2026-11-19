// The weather where the AI table's story stands, as the page sends it with a turn (#1021 row 20). Pure: no I/O.
//
// The weather system gives the sky (`lib/calendar/weather.ts`) and what it has made dangerous on this ground
// (`weatherHazards.ts`). The narrator is told both in fixed words; the server checks each against its own list and
// writes the sentence (`_shared/agent/sky.ts`), so the reasons the hazard rules word for a person stay here.

import type { Hazard } from "@/lib/calendar/weatherHazards";
import type { Weather } from "@/lib/calendar/weather";

export interface TableSky {
  temperature: Weather["temperature"];
  precipitation: Weather["precipitation"];
  wind: Weather["wind"];
  fog: boolean;
  dangers: Array<{ kind: Hazard["kind"]; level: Hazard["level"] }>;
}

/** The sky to send, or null when there is none to tell: underground, or a date the calendar cannot place. */
export function tableSky(weather: Weather | null, hazards: readonly Hazard[]): TableSky | null {
  if (weather === null) return null;
  return { temperature: weather.temperature, precipitation: weather.precipitation, wind: weather.wind, fog: weather.fog, dangers: hazards.map((h) => ({ kind: h.kind, level: h.level })) };
}
