/**
 * Median of a list. For an even count the two middle values are averaged, so
 * the result can be a value no single run produced; use `medianIndex` when a
 * real run is needed (e.g. to pick which run's request list to show).
 */
export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error("median of an empty list");
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid];
  const lo = sorted[mid - 1];
  if (hi === undefined) throw new Error("unreachable: index inside a non-empty list");
  if (sorted.length % 2 === 1) return hi;
  if (lo === undefined) throw new Error("unreachable: even list has a lower middle");
  return (lo + hi) / 2;
}

/** Median that ignores `null` (a metric a run could not measure); `null` if no run measured it. */
export function medianOrNull(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length === 0 ? null : median(present);
}

/** Index of the run holding the (lower) median value, so a real run can stand for the median. */
export function medianIndex(values: readonly number[]): number {
  if (values.length === 0) throw new Error("medianIndex of an empty list");
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const picked = order[Math.floor((order.length - 1) / 2)];
  if (picked === undefined) throw new Error("unreachable: index inside a non-empty list");
  return picked.index;
}
