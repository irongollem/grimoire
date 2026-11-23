/**
 * Ask Grimoire (#1253): the pieces every adapter repeats, said once, so none keeps a private copy that can drift.
 *
 * Each adapter still owns its own reading of the proposal, its quote and its run; what is shared is the arithmetic
 * and the sentences: what a priced line charged, a run that made nothing, the description gate, the word matching
 * that decides what the model's free text means, why a save threw, and the part a failed picture leaves behind.
 * Not an adapter: the registry finds adapters by the `*AskAdapter.ts` name, which this file does not have.
 */
import type { AskQuoteBlock, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
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
          ? { label, ok: true, credits: retry.credits === null ? args.credits : retry.credits }
          : { label, ok: false, credits: 0, error: retry.error() ?? `The ${label.toLowerCase()} could not be painted.` };
      },
    },
  };
}
