/**
 * PostgREST's `or=` takes a comma-separated filter list, and `,` `.` `:` `(` `)`
 * inside a bare value are read as syntax: "Crossbow Bolts (20)" makes the whole
 * request a 400. A value in double quotes is data, with `"` and `\` escaped by a
 * backslash inside it.
 */
export function orFilterValue(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

/** Escapes LIKE's own wildcards, so an `ilike` pattern matches the text literally. */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
