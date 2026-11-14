import type { SortDir } from "@/lib/noteSort";

/**
 * What a sort field orders by, which decides how its direction is said.
 * `fixed` is an order with nothing to reverse: a hand-made order, a provider's
 * best match, the Atlas's own tree order.
 */
export type SortOrder = "date" | "text" | "number" | "fixed";

/** One field a list can be sorted by. Its label is a plain noun; the direction is the toggle's job. */
export interface SortOption<F extends string> {
  value: F;
  label: string;
  order: SortOrder;
  /** Words for a field whose own terms beat the generic ones ("Shortest first" for a length). */
  directions?: { asc: string; desc: string };
}

const DIRECTION_WORDS: Record<Exclude<SortOrder, "fixed">, Record<SortDir, string>> = {
  date: { asc: "Oldest first", desc: "Newest first" },
  text: { asc: "A to Z", desc: "Z to A" },
  number: { asc: "Lowest first", desc: "Highest first" },
};

/** How the list runs, in the field's own words; null for an order with no direction. */
export function directionLabel<F extends string>(option: SortOption<F>, dir: SortDir): string | null {
  if (option.order === "fixed") return null;
  return option.directions?.[dir] ?? DIRECTION_WORDS[option.order][dir];
}
