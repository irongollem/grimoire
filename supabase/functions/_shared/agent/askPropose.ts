// Checking a proposal (#1253): the generator the model chose and what it understood of the request. The model never
// runs a generator; it proposes one, and the browser quotes and runs it after the DM confirms. Every field is still
// checked here, because the model can name any id it has seen and any key it can imagine, and the quote card must
// never show (or later send) something the generator does not take.
// Pure: the one lookup (does the target belong to the campaign) comes in as a function.

import type { AskGenerator, AskInputSchema, AskProposal, AskRecordRef } from "./askContract.ts";
import { ASK_GENERATORS, askGenerator } from "./askContract.ts";
import { isAskRecordType } from "./askBody.ts";
import { UUID_RE } from "../uuid.ts";

export const CONCEPT_MAX = 2000;
const TEXT_INPUT_MAX = 500;

/** A generator the campaign's game system offers: the 5e ones only where the system has 5e rules (`offers("stat-blocks")`). */
export function generatorsFor(fiveE: boolean): readonly AskGenerator[] {
  return ASK_GENERATORS.filter((g) => g.fiveE !== true || fiveE);
}

/** One input value kept as the schema says, or undefined when it does not fit (the key is then dropped). */
function inputValue(schema: AskInputSchema, value: unknown): string | number | boolean | undefined {
  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return undefined;
      const text = value.trim();
      if (text === "" || text.length > TEXT_INPUT_MAX) return undefined;
      if (schema.enum !== undefined && !schema.enum.includes(text)) return undefined;
      return text;
    }
    case "integer": {
      if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
      if (schema.minimum !== undefined && value < schema.minimum) return undefined;
      if (schema.maximum !== undefined && value > schema.maximum) return undefined;
      return value;
    }
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
  }
}

/** Ids in an input read "id" in their name (`location_id`, `parent_id`): the model may only have seen them, so they must at least be uuids. */
function isIdInput(key: string): boolean {
  return key.endsWith("_id");
}

export type ProposalCheck =
  | { ok: true; proposal: Omit<AskProposal, "proposalId">; dropped: string[] }
  | { ok: false; error: string };

export async function checkProposal(
  raw: Record<string, unknown>,
  ctx: {
    fiveE: boolean;
    /** The record of THIS campaign by kind and id, or null. */
    loadTarget(type: AskRecordRef["type"], id: string): Promise<{ name: string } | null>;
  },
): Promise<ProposalCheck> {
  const generator = typeof raw.generator === "string" ? askGenerator(raw.generator) : undefined;
  if (generator === undefined) {
    return { ok: false, error: `Unknown generator. Choose one of: ${generatorsFor(ctx.fiveE).map((g) => g.id).join(", ")}.` };
  }
  if (generator.fiveE === true && !ctx.fiveE) {
    return { ok: false, error: `${generator.action} needs a 5e rules system, and this campaign plays none. Choose another generator or answer in words.` };
  }
  const concept = typeof raw.concept === "string" ? raw.concept.trim() : "";
  if (concept === "") return { ok: false, error: "A proposal needs a concept: what the DM described, in their words." };

  const given = typeof raw.inputs === "object" && raw.inputs !== null && !Array.isArray(raw.inputs)
    ? raw.inputs as Record<string, unknown>
    : {};
  const inputs: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(given)) {
    const schema = generator.inputs[key];
    // A key the generator does not take is dropped, never forwarded: the panel's adapter would read it as an option.
    const kept = schema === undefined ? undefined : inputValue(schema, value);
    if (kept === undefined || (isIdInput(key) && (typeof kept !== "string" || !UUID_RE.test(kept)))) dropped.push(key);
    else inputs[key] = kept;
  }

  let target: AskRecordRef | undefined;
  if (generator.target !== undefined) {
    const asked = raw.target;
    if (typeof asked !== "object" || asked === null || Array.isArray(asked)) {
      return { ok: false, error: `${generator.action} works on an existing record: name its target (${generator.target.join(", ")}) by id, after reading it.` };
    }
    const { type, id } = asked as Record<string, unknown>;
    if (!isAskRecordType(type) || !generator.target.includes(type)) {
      return { ok: false, error: `The target of ${generator.action} must be one of: ${generator.target.join(", ")}.` };
    }
    if (typeof id !== "string" || !UUID_RE.test(id)) return { ok: false, error: "The target's id must be the uuid of a record you read." };
    const found = await ctx.loadTarget(type, id);
    // Not in this campaign, or not there at all: the same answer, so the model cannot probe for other campaigns' ids.
    if (found === null) return { ok: false, error: "That target is not a record of this campaign. Read it with search or find first." };
    target = { type, id, name: found.name };
  }

  return { ok: true, proposal: { generator: generator.id, concept: concept.slice(0, CONCEPT_MAX), inputs, ...(target ? { target } : {}) }, dropped };
}
