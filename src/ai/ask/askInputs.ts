/**
 * Ask Grimoire (#1253): reads a proposal's `inputs` against its generator's schema in `ASK_GENERATORS`.
 *
 * The model fills `inputs`, and the model is not trusted: a key the schema does not list, a value of the wrong type,
 * a number out of range or a word outside an enum is dropped here, so only what the schema allows can reach a
 * generator or a quote. A dropped value is simply not understood, never an error: the DM sees the quote without it.
 */
import { isUuid } from "@/lib/library/contentIdentity";
import { ASK_GENERATORS, type AskInputSchema } from "@edge-shared/agent/askContract";

export type AskInputValue = string | number | boolean;

function readOne(schema: AskInputSchema, value: unknown): AskInputValue | undefined {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return undefined;
      const text = value.trim();
      if (text === "") return undefined;
      // A record input is the uuid of a row, nothing else: a name or a made-up id never reaches a lookup.
      if (schema.record !== undefined && !isUuid(text)) return undefined;
      if (schema.enum && !schema.enum.includes(text.toLowerCase())) return undefined;
      return schema.enum ? text.toLowerCase() : text;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
      if (schema.minimum !== undefined && value < schema.minimum) return undefined;
      if (schema.maximum !== undefined && value > schema.maximum) return undefined;
      return value;
    }
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
    case "links":
      // A list of ties, not a plain value: read by `readAskLinks` (askAdapterKit), which resolves each in this campaign.
      return undefined;
  }
}

/** The inputs of `inputs` the generator's schema accepts, by key. */
export function readAskInputs(generatorId: string, inputs: Readonly<Record<string, unknown>>): Record<string, AskInputValue> {
  const generator = ASK_GENERATORS.find((g) => g.id === generatorId);
  const read: Record<string, AskInputValue> = {};
  if (!generator) return read;
  for (const [key, schema] of Object.entries(generator.inputs)) {
    const value = readOne(schema, inputs[key]);
    if (value !== undefined) read[key] = value;
  }
  return read;
}

export function askString(inputs: Record<string, AskInputValue>, key: string): string | null {
  const value = inputs[key];
  return typeof value === "string" ? value : null;
}

export function askInteger(inputs: Record<string, AskInputValue>, key: string): number | null {
  const value = inputs[key];
  return typeof value === "number" ? value : null;
}

/** A switch the DM did not mention is off: Ask never spends credits on a picture nobody asked for. */
export function askFlag(inputs: Record<string, AskInputValue>, key: string): boolean {
  return inputs[key] === true;
}
