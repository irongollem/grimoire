/** A table's row fills: the look's own, striped with the look's stripe, or none. */
export type TableRows = "look" | "striped" | "plain";

const STRIPED = "sc-table--striped";
const PLAIN = "sc-table--plain";

/** Which choice a table's class attribute makes. */
export function tableRowsOf(cls: unknown): TableRows {
  const tokens = typeof cls === "string" ? cls.split(/\s+/) : [];
  if (tokens.includes(PLAIN)) return "plain";
  if (tokens.includes(STRIPED)) return "striped";
  return "look";
}

/** The class attribute after choosing `rows`, keeping every other class the table carries. */
export function withTableRows(cls: unknown, rows: TableRows): string | null {
  const others = (typeof cls === "string" ? cls.split(/\s+/) : []).filter((t) => t !== "" && t !== STRIPED && t !== PLAIN);
  if (rows === "striped") others.push(STRIPED);
  if (rows === "plain") others.push(PLAIN);
  return others.length > 0 ? others.join(" ") : null;
}
