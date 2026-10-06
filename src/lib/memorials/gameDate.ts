interface GameDateAdapter {
  epochName: string;
  months: ReadonlyArray<{ num: number; name: string }>;
}

/** "14 Mirtul 1492 DR": the month is looked up by `num`, the epoch appended only if non-empty. */
export function formatGameDate(adapter: GameDateAdapter, year: number, month: number, day: number): string {
  const monthName = adapter.months.find((m) => m.num === month)?.name;
  const parts = [String(day)];
  if (monthName) parts.push(monthName);
  parts.push(String(year));
  if (adapter.epochName) parts.push(adapter.epochName);
  return parts.join(" ");
}
