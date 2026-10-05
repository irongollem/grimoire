/** The text colour for a hit point readout: green while healthy, red when low. */
export function hpTextClass(hp: number, max: number): string {
  const pct = max === 0 ? 0 : Math.max(0, Math.min(100, (hp / max) * 100));
  if (pct < 33) return "text-destructive";
  if (pct < 66) return "text-ink-caution";
  return "text-elven-green";
}
