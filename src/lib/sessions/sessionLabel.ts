interface Labelled {
  number: number | null;
  title: string | null;
}

/** How a session is named wherever it is listed: "Session 15: Into the Mere". */
export function sessionLabel({ number, title }: Labelled): string {
  const name = title?.trim() || null;
  if (number !== null && name) return `Session ${number}: ${name}`;
  if (number !== null) return `Session ${number}`;
  if (name) return name;
  return "Unnumbered session";
}

/** The short form for chrome that has no room for a title. */
export function sessionShortLabel({ number }: Pick<Labelled, "number">): string {
  return number !== null ? `Session ${number}` : "No number";
}
