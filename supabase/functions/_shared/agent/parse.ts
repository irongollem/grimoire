/**
 * The small pieces every agent tool parser needs: a result that is either a value or a sentence the
 * model can read, the id shape the database uses, and a check that a parsed JSON value is an object.
 * They lived as private copies in a dozen tool files; one place means a fix reaches all of them.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A refusal in the shape every parser returns, so a tool answers with a sentence instead of throwing. */
export const refuse = (error: string): { ok: false; error: string } => ({ ok: false, error });

export { UUID_RE } from "../uuid.ts";

/** A plain object: not null, not an array. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
