// Checking a proposal (#1253): the generator the model chose and what it understood of the request. The model never
// runs a generator; it proposes one, and the browser quotes and runs it after the DM confirms. Every field is still
// checked here, because the model can name any id it has seen and any key it can imagine, and the quote card must
// never show (or later send) something the generator does not take.
// Pure: the one lookup (does the target belong to the campaign) comes in as a function.

import type { AskGenerator, AskInputSchema, AskProposal, AskRecordRef } from "./askContract.ts";
import { ASK_GENERATORS, askGenerator } from "./askContract.ts";
import { BUTTON_ONLY_GENERATORS } from "./askGenerators/editors.ts";
import { isAskRecordType } from "./askBody.ts";
import { UUID_RE } from "../uuid.ts";
import { LINKS_MAX, choiceForRelation, isLinkKind, linkChoices, relationWord, type AskLink } from "./askLinks.ts";

export const CONCEPT_MAX = 2000;
const TEXT_INPUT_MAX = 500;

/**
 * A generator the model may propose: the campaign's game system offers it (the 5e ones only where the system has 5e
 * rules, `offers("stat-blocks")`) and it is not one that only a page's button opens (`BUTTON_ONLY_GENERATORS`).
 */
export function generatorsFor(fiveE: boolean): readonly AskGenerator[] {
  return ASK_GENERATORS.filter((g) => (g.fiveE !== true || fiveE) && !BUTTON_ONLY_GENERATORS.has(g.id));
}

export type LinksCheck = { ok: true; links: AskLink[]; dropped: string[] } | { ok: false; error: string };

/**
 * The `links` input: each tie kept only when its kind is one the generator offers, its id is a uuid of a record of THIS
 * campaign of that kind, and its relation is a word the catalogue holds between the two kinds. A wrong relation is
 * answered with the words that pair does hold (as an out-of-list enum word is), because dropped, the tie silently
 * vanishes and the DM gets a record that is not tied to what they named. A record that is not the campaign's is
 * dropped without saying more, so the model cannot probe for other campaigns' ids.
 */
async function checkLinks(
  schema: Extract<AskInputSchema, { type: "links" }>,
  value: unknown,
  loadTarget: (type: AskRecordRef["type"], id: string) => Promise<{ name: string } | null>,
): Promise<LinksCheck> {
  if (!Array.isArray(value)) return { ok: true, links: [], dropped: ["links"] };
  const links: AskLink[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of value.slice(0, LINKS_MAX).entries()) {
    const label = `links[${index}]`;
    const raw = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry as Record<string, unknown> : null;
    if (raw === null || !isLinkKind(raw.kind) || !schema.kinds.includes(raw.kind) || typeof raw.id !== "string" || !UUID_RE.test(raw.id) || typeof raw.relation !== "string") {
      dropped.push(label);
      continue;
    }
    const choice = choiceForRelation(schema.subject, raw.kind, raw.relation);
    if (choice === null) {
      const words = linkChoices(schema.subject, raw.kind).map(relationWord);
      return {
        ok: false,
        error: words.length === 0
          ? `A ${schema.subject.replace(/_/g, " ")} cannot be tied to a ${raw.kind.replace(/_/g, " ")}. Leave that link out and propose again.`
          : `\`links\` relation "${raw.relation.trim().slice(0, 60)}" is not one a ${schema.subject.replace(/_/g, " ")} can have to a ${raw.kind.replace(/_/g, " ")}. Choose one of: ${words.join(", ")}; propose again.`,
      };
    }
    // One tie per record and word: the model repeating itself must not write the same row twice.
    const key = `${raw.kind}:${raw.id}:${relationWord(choice)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (await loadTarget(raw.kind, raw.id) === null) {
      dropped.push(label);
      continue;
    }
    links.push({ kind: raw.kind, id: raw.id, relation: relationWord(choice) });
  }
  if (value.length > LINKS_MAX) dropped.push(`links beyond the first ${LINKS_MAX}`);
  return { ok: true, links, dropped };
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
    case "links":
      // Read by `checkLinks`, which needs the campaign; never kept as a plain value.
      return undefined;
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
  if (generator === undefined || BUTTON_ONLY_GENERATORS.has(generator.id)) {
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
    // A word outside an option's list is answered, not dropped: dropped, the panel falls back to the option's
    // default and makes something the DM did not ask for (live run, 23 Nov 2026: "younger sister" for `relation`
    // made the sister a mere contact of the innkeeper). Told the words it may use, the model asks again at once.
    if (schema?.type === "string" && schema.enum !== undefined && typeof value === "string" && value.trim() !== "" && !schema.enum.includes(value.trim())) {
      return { ok: false, error: `\`${key}\` must be one of: ${schema.enum.join(", ")}. "${value.trim().slice(0, 60)}" is not one of them; choose the nearest and propose again.` };
    }
    if (schema?.type === "links") {
      const checked = await checkLinks(schema, value, ctx.loadTarget);
      if (!checked.ok) return checked;
      dropped.push(...checked.dropped);
      if (checked.links.length > 0) inputs[key] = checked.links;
      continue;
    }
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
