/**
 * A card a page opened can ask that the record it makes be tied to something on that page (#1282): "Make its stat
 * block" on a species' form opens the monster card, and the monster it makes is bound to that form. The request is
 * plain data (it rides on the proposal), and the conversation knows only that a kind has a binder to call.
 */
export type AskBind = { kind: "species_form"; formId: string; formLabel: string };

/** What a binder says back for the result card: whether the tie was made, and a sentence for the DM either way. */
export interface AskBindOutcome {
  ok: boolean;
  text: string;
}

/** Ties a made record to what the bind names. Never throws: a failure is an outcome with `ok: false`. */
export type AskBinder = (bind: AskBind, record: { type: string; id: string; name: string }) => Promise<AskBindOutcome>;

/** The record type each kind of bind takes: a record of any other type binds nothing. */
export const BIND_RECORD_TYPE: Readonly<Record<AskBind["kind"], string>> = { species_form: "monster" };
