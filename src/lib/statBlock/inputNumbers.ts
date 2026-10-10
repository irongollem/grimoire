/** Reading a number out of an `AppInput` value, which is a string until committed. */
export function toInt(v: string | number | null | undefined, fallback: number): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** An empty field is absence, not zero. */
export function toOptional(v: string | number | null | undefined): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = toInt(v, Number.NaN);
  return Number.isFinite(n) ? n : undefined;
}
