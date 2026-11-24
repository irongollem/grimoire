/**
 * Extra constraint lines a client adds to a generation request, such as the creature the encounter generator rolled
 * from the habitat of the party's place (#1255). They come from the caller, so they are user input: kept to a few
 * short single lines, and placed by the caller inside the wrapped user input rather than among the server's own
 * constraints. Anything that is not a list of strings is ignored, never an error, so an older client keeps working.
 */
export const MAX_CLIENT_CONSTRAINTS = 4;
export const MAX_CLIENT_CONSTRAINT_LENGTH = 300;

export function readClientConstraints(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.replace(/\s+/g, " ").trim().slice(0, MAX_CLIENT_CONSTRAINT_LENGTH))
    .filter((line) => line.length > 0)
    .slice(0, MAX_CLIENT_CONSTRAINTS);
}
