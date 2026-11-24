/**
 * Ask Grimoire (#1270): the two ends every "fill the form open on the page" adapter shares, so the four of them
 * (an NPC, monster or spell editor, the calendar's event) cannot word them differently or lose a paid result differently.
 *
 * The card is bound to the one form instance that opened it (`proposal.target.id` is the token `useAskFormFill` made),
 * so a result never lands in another record's form.
 *
 * Not an adapter: the registry finds adapters by the `*AskAdapter.ts` name, which this file does not have.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskQuoteBlock, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { FORM_INSTANCE_PREFIX, useAskFormFillStore, type FormFiller } from "@/stores/ui/askFormFill";

/** The form instance a card was opened from, or null for a card that was not opened by a form's own button. */
export function formInstanceOf(proposal: AskProposal): string | null {
  const id = proposal.target?.id;
  return id !== undefined && id.startsWith(FORM_INSTANCE_PREFIX) ? id : null;
}

/** The filler of the form this card was opened from, or null once that form is closed. */
export function fillerOf<R, C = undefined>(generatorId: string, proposal: AskProposal): FormFiller<R, C> | null {
  return useAskFormFillStore().fillerFor<R, C>(generatorId, formInstanceOf(proposal));
}

/** The quote's block while the form the card came from is not open: the card has nothing to fill, so nothing is spent. */
export function formClosedBlock(generatorId: string, form: string, proposal: AskProposal): AskQuoteBlock | null {
  return fillerOf(generatorId, proposal) === null
    ? { reason: "missing", message: `The ${form} this was opened from is closed. Open it and press Generate again.` }
    : null;
}

/** "Short description" for a key like `short_description` or `shortDescription`. */
function wordsOf(key: string): string {
  const spaced = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function shownValue(value: unknown): string | null {
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return null;
  const json = JSON.stringify(value);
  return json === undefined || json === "{}" || json === "[]" ? null : json;
}

/** What was generated, one "Label: value" line per filled field, for a DM to copy when the form is gone. */
export function resultLines(result: unknown): string[] {
  if (typeof result !== "object" || result === null) return [];
  return Object.entries(result).flatMap(([key, value]) => {
    const text = shownValue(value);
    return text === null ? [] : [`${wordsOf(key)}: ${text}`];
  });
}

/**
 * Ends a paid run. The form that opened the card, if still open, takes the values (and nothing is saved or opened: the
 * DM reviews the form and saves it as always). If it was closed while the run was going, the credits are spent and no
 * other form may take the result, so the card lists the values for the DM to copy.
 */
export function landInForm<R>(args: {
  generatorId: string;
  proposal: AskProposal;
  /** What the part says it filled: "Sheet", "Description". */
  label: string;
  /** The form's name for the DM, in "The NPC editor was closed". */
  form: string;
  name: string;
  result: R;
  credits: number;
}): AskRunResult {
  const filler = fillerOf<R>(args.generatorId, args.proposal);
  const record = { type: "other" as const, id: "", name: args.name };
  if (filler !== null) {
    filler.apply(args.result);
    return { record, route: null, parts: [{ label: `${args.label} filled in`, ok: true, credits: args.credits }] };
  }
  const written: AskRunPart = {
    label: `${args.label} written, but the ${args.form} it was for is closed, so nothing was filled in. Copy what you need below`,
    ok: true,
    credits: args.credits,
  };
  return { record, route: null, parts: [written, ...resultLines(args.result).map((label): AskRunPart => ({ label, ok: true, credits: 0 }))] };
}
