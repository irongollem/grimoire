import { TIMES_OF_DAY, type TimeOfDay } from "@/lib/canon/ecologyTypes";

/** The encounter card's Time of day as an hour: "any" (the card's default), nothing and anything unknown are no hour. */
export function timeOfDayOf(value: unknown): TimeOfDay | null {
  return TIMES_OF_DAY.find((t) => t === value) ?? null;
}
