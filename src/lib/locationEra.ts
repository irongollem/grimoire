import type { Location } from "@/types/location.types";

export function isLocationOutOfEra(
  location: Pick<Location, "era_start" | "era_end">,
  currentYear: number,
): boolean {
  if (location.era_start !== null && currentYear < location.era_start) return true;
  if (location.era_end !== null && currentYear > location.era_end) return true;
  return false;
}
