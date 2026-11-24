/**
 * Ask Grimoire (#1270): the rules of the card's form that are not drawing, so they can be tested without a DOM.
 *
 * The form is a reading of the generator's contract: which inputs show for the values held, what an input's label is,
 * which inputs fold into one row, and what a fold row says it holds.
 */
import type { AskGenerator, AskInputSchema } from "@edge-shared/agent/askContract";

export type AskFormInputs = Readonly<Record<string, unknown>>;

/** "Set" for a form: a word that is not blank, a number, a switch that is on, a tie list that is not empty. */
export function isSet(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

const NONE: ReadonlySet<string> = new Set();

/** Whether an input shows for the values held: its `when` holds, or it has none. */
export function isShown(schema: AskInputSchema, inputs: AskFormInputs): boolean {
  const when = schema.when;
  if (!when) return true;
  const keys = typeof when.key === "string" ? [when.key] : when.key;
  return keys.some((key) => {
    const value = inputs[key];
    if (!isSet(value)) return false;
    return when.is === undefined || (typeof value === "string" && when.is.includes(value));
  });
}

/**
 * `inputs` without the values whose input no longer shows. A condition can hang on an input that was itself just
 * hidden (the other parent needs a relation, which needs a person), so this runs until nothing more drops: a value
 * the DM cannot see must never ride along into a quote.
 */
export function pruneHidden(generator: AskGenerator, inputs: AskFormInputs, unavailable: ReadonlySet<string> = NONE): Record<string, unknown> {
  let current: Record<string, unknown> = { ...inputs };
  for (;;) {
    const hidden = Object.entries(generator.inputs).filter(([key, schema]) => key in current && (unavailable.has(key) || !isShown(schema, current)));
    if (hidden.length === 0) return current;
    current = Object.fromEntries(Object.entries(current).filter(([key]) => !hidden.some(([h]) => h === key)));
  }
}

/** The DM's word for one enum value: the contract's own when it gives one, else the value with spaces, capitalised. */
export function optionLabel(schema: AskInputSchema, value: string): string {
  const given = schema.type === "string" ? schema.optionLabels?.[value] : undefined;
  if (given !== undefined) return given;
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The DM's word for an input; a key not yet given a label reads as its key with spaces. */
export function inputLabel(key: string, schema: AskInputSchema): string {
  return schema.label ?? key.replace(/_/g, " ");
}

export type AskFormRow =
  | { kind: "input"; key: string; schema: AskInputSchema }
  | { kind: "group"; name: string; members: { key: string; schema: AskInputSchema }[] };

/**
 * The form's rows, in contract order: an ungrouped input is its own row, and the inputs of one group fold into one
 * row placed where the group's first member stands. A group whose members are all hidden has no row.
 */
export function formRows(generator: AskGenerator, inputs: AskFormInputs, unavailable: ReadonlySet<string> = NONE): AskFormRow[] {
  const rows: AskFormRow[] = [];
  const groups = new Map<string, Extract<AskFormRow, { kind: "group" }>>();
  for (const [key, schema] of Object.entries(generator.inputs)) {
    if (unavailable.has(key) || !isShown(schema, inputs)) continue;
    if (schema.group === undefined) {
      rows.push({ kind: "input", key, schema });
      continue;
    }
    const existing = groups.get(schema.group);
    if (existing) {
      existing.members.push({ key, schema });
      continue;
    }
    const row: Extract<AskFormRow, { kind: "group" }> = { kind: "group", name: schema.group, members: [{ key, schema }] };
    groups.set(schema.group, row);
    rows.push(row);
  }
  return rows;
}

/** What a fold row says it holds: the values set, in order, or that nothing is. `shown` turns a value into words. */
export function groupSummary(members: readonly { key: string }[], inputs: AskFormInputs, shown: (key: string, value: unknown) => string | null): string {
  const parts = members.flatMap(({ key }) => {
    const value = inputs[key];
    if (!isSet(value)) return [];
    const text = shown(key, value);
    return text === null || text === "" ? [] : [text];
  });
  return parts.length === 0 ? "Nothing set" : parts.join(" · ");
}
