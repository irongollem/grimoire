/**
 * Ask Grimoire (#1270): the two ends every "fill the form open on the page" adapter shares, so the four of them
 * (an NPC, monster or spell editor, the calendar's event) cannot word them differently or lose a paid result differently.
 *
 * Not an adapter: the registry finds adapters by the `*AskAdapter.ts` name, which this file does not have.
 */
import type { AskQuoteBlock, AskRunResult } from "@/lib/ask/askAdapter";
import { useAskFormFillStore, type FormFiller } from "@/stores/ui/askFormFill";

/** The quote's block while the form is not open: the card has nothing to fill, so nothing is spent. */
export function formClosedBlock(generatorId: string, form: string): AskQuoteBlock | null {
  return useAskFormFillStore().fillerFor(generatorId) === null
    ? { reason: "missing", message: `Open the ${form} you want filled first.` }
    : null;
}

/**
 * Ends a paid run. The form still open takes the values (and nothing is saved or opened: the DM reviews the form and
 * saves it as always). A form closed while the run was going cannot, and the credits are spent, so the result is kept
 * for the next time that form opens (`useAskFormFill` applies it) and the card says so.
 */
export function landInForm<R>(args: {
  generatorId: string;
  /** What the part says it filled: "Sheet", "Description". */
  label: string;
  /** The form's name for the DM, in "Open the NPC editor again". */
  form: string;
  name: string;
  result: R;
  credits: number;
}): AskRunResult {
  const store = useAskFormFillStore();
  const filler: FormFiller<R> | null = store.fillerFor<R, undefined>(args.generatorId);
  const record = { type: "other" as const, id: "", name: args.name };
  if (filler !== null) {
    filler.apply(args.result);
    return { record, route: null, parts: [{ label: `${args.label} filled in`, ok: true, credits: args.credits }] };
  }
  store.keep(args.generatorId, args.result);
  return {
    record,
    route: null,
    parts: [{ label: `${args.label} written. The ${args.form} was closed, so it is kept: open it again and it fills in`, ok: true, credits: args.credits }],
  };
}
