/**
 * Ask Grimoire (#1253): the pieces every adapter repeats, said once, so none keeps a private copy that can drift.
 *
 * Each adapter still owns its own reading of the proposal, its quote and its run; what is shared is the arithmetic
 * and the sentences: what a priced line charged, a run that made nothing, the description gate, the word matching
 * that decides what the model's free text means, why a save threw, and the part a failed picture leaves behind.
 * Not an adapter: the registry finds adapters by the `*AskAdapter.ts` name, which this file does not have.
 */
import type { AskChoices, AskQuoteBlock, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { ASK_GENERATORS, type AskInputSchema } from "@edge-shared/agent/askContract";
import { LINKS_MAX, choiceForRelation, isLinkKind, relationWord, type AskLink } from "@edge-shared/agent/askLinks";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";
import { isUuid } from "@/lib/library/contentIdentity";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { isQuotaExceeded } from "@/lib/quotaError";

/** What a line charged: a price that is still unknown at run time cannot be, since the quote waits for it. */
export function spent(line: AskQuoteLine | undefined): number {
  return line && line.credits !== null ? line.credits : 0;
}

/** A run that saved nothing: one failed part saying why. */
export function failedRun(label: string, error: string): AskRunResult {
  return { record: null, route: null, parts: [{ label, ok: false, credits: 0, error }] };
}

/**
 * The gate every generator shares on the description: it must exist and must fit the generator's limit. The wording
 * is the page's own where it differs (`empty`, `shorten`), the limit is the generator's own (`limit`).
 */
export function conceptBlock(
  concept: string,
  noun: string,
  options: { empty?: string; limit?: number; shorten?: string } = {},
): AskQuoteBlock | null {
  const limit = options.limit ?? AI_PROMPT_LIMIT;
  if (concept === "") return { reason: "missing", message: options.empty ?? `Say what this ${noun} is like first.` };
  if (concept.length > limit) return { reason: "missing", message: `Shorten the ${options.shorten ?? "description"} to ${limit} characters.` };
  return null;
}

/** Words as a DM or a model says them: case, spaces, hyphens and underscores do not tell two spellings apart. */
function plain(word: string): string {
  return word.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function sameWord(a: string, b: string): boolean {
  return plain(a) === plain(b);
}

/** A value of the proposal matched, case and spacing aside, against a list of known keys: the key, or null. */
export function matchKey<T extends string>(value: string | null, keys: readonly T[]): T | null {
  if (value === null) return null;
  const found = keys.find((key) => sameWord(key, value));
  return found ?? null;
}

/**
 * The option the model's word names, by its id or its label, or null. The model's inputs are free text: a word the
 * page's own picker does not offer is not understood, never passed on to the generator.
 */
export function matchOption<T extends string>(value: string | null, options: ReadonlyArray<{ id: T; label: string }>): T | null {
  if (value === null) return null;
  const found = options.find((o) => sameWord(o.id, value) || sameWord(o.label, value));
  return found ? found.id : null;
}

/** Why a save threw, in a sentence for the DM. A quota race on the create is the plan's limit, not a fault. */
export function saveFailure(e: unknown, plural: string, fallback: string): string {
  if (isQuotaExceeded(e)) return `You have reached your limit of ${plural} on this plan.`;
  return e instanceof Error ? e.message : fallback;
}

/**
 * The picture part of a run whose record is saved. `retry` is the page's own paint flow for kinds that have one
 * (`useMissingPortrait`); a kind without one leaves a failed part with no retry, and says so.
 */
export function picturePart(args: {
  label?: string;
  saved: boolean;
  credits: number;
  noun: string;
  retry?: { credits: number | null; paint: () => Promise<string | null>; error: () => string | null };
}): AskRunPart {
  const label = args.label ?? "Picture";
  if (args.saved) return { label, ok: true, credits: args.credits };
  const failed: AskRunPart = {
    label,
    ok: false,
    credits: 0,
    error: `The ${label.toLowerCase()} could not be painted. The ${args.noun} is saved without one.`,
  };
  const retry = args.retry;
  if (!retry) return failed;
  return {
    ...failed,
    retry: {
      credits: retry.credits,
      run: async (): Promise<AskRunPart> => {
        const url = await retry.paint();
        return url
          ? { label, ok: true, credits: retry.credits === null ? args.credits : retry.credits, picture: url }
          : { label, ok: false, credits: 0, error: retry.error() ?? `The ${label.toLowerCase()} could not be painted.` };
      },
    },
  };
}

// ── Ties to existing records (the generic `links` input) ────────────────────────────────────────────────────────────

type LinksSchema = Extract<AskInputSchema, { type: "links" }>;

/** The generator's `links` option: its key and what it may tie to, or null for a generator that takes no ties. */
function linksInput(generatorId: string): { key: string; schema: LinksSchema } | null {
  const generator = ASK_GENERATORS.find((g) => g.id === generatorId);
  for (const [key, schema] of Object.entries(generator?.inputs ?? {})) {
    if (schema.type === "links") return { key, schema };
  }
  return null;
}

/**
 * The `links` of a proposal, read again in the browser against the contract (the server already checked them, and the
 * panel's Adjust or a stale proposal can still carry anything): only the kinds the generator offers, a uuid id, and a
 * relation word the catalogue holds between the generator's kind and that kind, at most `LINKS_MAX`, one per record
 * and word. A malformed entry is skipped, never an error: the DM sees the quote without it.
 */
export function readAskLinks(generatorId: string, inputs: Readonly<Record<string, unknown>>): AskLink[] {
  const found = linksInput(generatorId);
  if (!found) return [];
  const { key, schema } = found;
  const given = inputs[key];
  if (!Array.isArray(given)) return [];
  const links: AskLink[] = [];
  const seen = new Set<string>();
  for (const entry of given) {
    if (links.length >= LINKS_MAX) break;
    const raw = typeof entry === "object" && entry !== null && !Array.isArray(entry) ? entry as Record<string, unknown> : null;
    if (raw === null || !isLinkKind(raw.kind) || !schema.kinds.includes(raw.kind) || typeof raw.id !== "string" || !isUuid(raw.id) || typeof raw.relation !== "string") continue;
    const choice = choiceForRelation(schema.subject, raw.kind, raw.relation);
    if (choice === null) continue;
    const word = relationWord(choice);
    const id = `${raw.kind}:${raw.id}:${word}`;
    if (seen.has(id)) continue;
    seen.add(id);
    links.push({ kind: raw.kind, id: raw.id, relation: word });
  }
  return links;
}

/**
 * The links as pending ties, with each record's name from this campaign (`names` keyed `kind:id`, filled by
 * `useAskLinkRecords`). A link whose record is not found is left out, so a record of another campaign is never tied;
 * the choice is the catalogue's own, resolved from the word again, so the stored direction is the page's.
 */
export function resolveAskLinks(generatorId: string, links: readonly AskLink[], names: ReadonlyMap<string, string>): GeneratorLink[] {
  const schema = linksInput(generatorId)?.schema;
  if (!schema) return [];
  const resolved: GeneratorLink[] = [];
  for (const link of links) {
    const name = names.get(`${link.kind}:${link.id}`);
    const choice = choiceForRelation(schema.subject, link.kind, link.relation);
    if (name !== undefined && choice !== null) resolved.push({ kind: link.kind, id: link.id, name, choice });
  }
  return resolved;
}

/**
 * The form's pending ties (`GeneratorLinksField`'s value) as the contract's `{kind, id, relation}`, the shape
 * `readAskLinks` reads: the word is the catalogue choice's, so reading it again finds the same choice. The other way
 * round is `resolveAskLinks`, which also needs the records' names.
 */
export function toAskLinks(links: readonly GeneratorLink[]): AskLink[] {
  return links.map((link) => ({ kind: link.kind, id: link.id, relation: relationWord(link.choice) }));
}

/** The yes or no in effect for a line: the DM's answer, else `byDefault`. */
export function askChoice(choices: AskChoices | undefined, key: string, byDefault: boolean): { key: string; on: boolean } {
  const given = choices?.[key];
  return { key, on: given === undefined ? byDefault : given };
}

/** One tie's key on the quote: the record and the catalogue choice, so two ties to one record are two answers. */
function linkChoiceKey(link: GeneratorLink): string {
  return `link:${link.kind}:${link.id}:${link.choice.key}:${link.choice.subjectIsFrom}`;
}

/** A quote line per tie, each a yes or no that starts at yes (the DM asked for it): "Worships: Auril". */
export function askLinkLines(links: readonly GeneratorLink[], choices?: AskChoices): AskQuoteLine[] {
  return links.map((link) => ({
    label: `${link.choice.word.charAt(0).toUpperCase()}${link.choice.word.slice(1)}`,
    value: link.name,
    credits: null,
    choice: askChoice(choices, linkChoiceKey(link), true),
  }));
}

/** The ties the DM left at yes: what the workflow writes and what the model is told about. */
export function chosenAskLinks(links: readonly GeneratorLink[], choices?: AskChoices): GeneratorLink[] {
  return links.filter((link) => askChoice(choices, linkChoiceKey(link), true).on);
}
