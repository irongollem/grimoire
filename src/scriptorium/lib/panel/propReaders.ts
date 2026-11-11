/** Reading a furniture item's loose props bag without coercing an absent value into a made-up one. */
export function numProp(props: Readonly<Record<string, string | number>>, key: string, fallback: number): number {
  const v = props[key];
  return typeof v === "number" ? v : fallback;
}

export function strProp(props: Readonly<Record<string, string | number>>, key: string, fallback: string): string {
  const v = props[key];
  if (typeof v === "string") return v;
  return typeof v === "number" ? String(v) : fallback;
}
