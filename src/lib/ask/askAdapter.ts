/**
 * Ask Grimoire (#1253): how the panel quotes and runs a generator the model proposed.
 *
 * One adapter per generator in `ASK_GENERATORS` (`@edge-shared/agent/askContract`). An adapter is a thin seam over
 * the generator's own workflow, the one its page calls, so the price, the quota and credit gates, the likeness check
 * and provenance are the page's exactly. Adapters are made by composables (`use<Name>AskAdapter`) because the
 * workflows are composables; the panel calls them in its setup, so they live as long as the panel's scope.
 *
 * The model never runs anything: a proposal becomes a quote, and only the DM's press on the quote calls `run`.
 */
import type { AskProposal, AskRecordType } from "@edge-shared/agent/askContract";

/**
 * The DM's yes or no to each quote line that would change a record that already exists (a tie to a person, a place,
 * a god, a faction), keyed by the line's `choice.key`. A key the DM has not touched is absent and the line's default
 * holds (maintainer, 23 Nov 2026: "a UI that allows yes/no on everything that edits existing state").
 */
export type AskChoices = Readonly<Record<string, boolean>>;

/** One line of the quote card: what, the value Ask understood, and its price (null for a line with no price). */
export interface AskQuoteLine {
  label: string;
  value: string;
  credits: number | null;
  /**
   * Set on a line that changes an existing record: the card draws it as a checkbox, and `run` writes it only while
   * `on`. `on` is the answer in effect: the DM's, else the line's default (yes for what the DM asked for, no for what
   * Ask offers on its own, such as the other children of a new parent).
   */
  choice?: { key: string; on: boolean };
  /** A line that only restates the concept: the card drops it when its own concept box already shows it. */
  repeatsConcept?: true;
}

/** Why the gilt button cannot run, said the way the generator's page says it. */
export interface AskQuoteBlock {
  reason: "quota" | "credits" | "system" | "likeness" | "missing";
  message: string;
}

export interface AskQuote {
  lines: AskQuoteLine[];
  /** Null while the provider (and so the price) is not known yet: the button waits, it never guesses. */
  total: number | null;
  block: AskQuoteBlock | null;
}

/** One part of a run (the record, its picture...), so a failure can say what worked and retry only what failed. */
export interface AskRunPart {
  label: string;
  ok: boolean;
  /** Credits this part cost (0 when it failed and was not charged). */
  credits: number;
  /** For a failed part: a sentence for the DM. */
  error?: string;
  /** For a failed part the workflow can redo alone, with its price. */
  retry?: { credits: number | null; run: () => Promise<AskRunPart> };
  /** A picture this part made (a retried portrait), shown on the result card in place of the result's own. */
  picture?: string;
}

export interface AskRunResult {
  /** The record made or filled; null when nothing was saved. */
  record: { type: AskRecordType | "other"; id: string; name: string } | null;
  /** Where "Open <noun>" or "Review suggestions" goes. */
  route: string | null;
  /**
   * For a result that lives in a page's own panel rather than at a route (quest hooks to pick from, canon
   * suggestions to keep or drop): what "Review suggestions" does after navigating to `route`, e.g. open that panel.
   */
  open?: () => void;
  /** The picture the run made (an NPC's portrait), shown on the result card so the DM sees it without leaving. */
  picture?: string;
  parts: AskRunPart[];
}

/** One line of a preview: what it is and the detail beside it ("4 x Goblin", "CR 1/4"). */
export interface AskPreviewRow {
  label: string;
  detail: string;
  /**
   * A choice the DM may change before Create (which sourcebook's version of a creature): the card draws a picker
   * under the row and reports a pick as `choose(key, value)`, and the adapter's `create` saves what was picked.
   */
  choice?: { key: string; label: string; options: { id: string; name: string }[]; value: string };
}

/**
 * What the result card shows of a generation that is not saved yet, as plain data so the card draws every generator's
 * preview the same way and no generator brings a Vue component of its own.
 */
export interface AskPreviewShown {
  /** The thing's name: the encounter's, the table's. */
  title: string;
  /** A short mark beside the title (the encounter's difficulty for the party). */
  badge?: string;
  /** Blocks of rows, each with an optional heading ("Combatants"), in the order they are shown. */
  sections: { heading?: string; /** A quiet line under the heading. */ hint?: string; rows: AskPreviewRow[] }[];
  /** A warning under the rows (creatures the Bestiary lacks). */
  note?: string;
}

/** A generation held for the DM's yes: what to show, what it cost, and the one call that saves it. */
export interface AskPreview {
  shown: AskPreviewShown;
  /**
   * The generation as parts, with the credits it cost. The conversation adds them up for the folded line; they are
   * charged by the generation itself and never again by `create`.
   */
  parts: AskRunPart[];
  /**
   * Saves what is shown and ends in the same result as `run` (the record and where to open it). Called once per
   * preview shown: the card keeps the DM from pressing twice. A save that fails resolves with `record: null` and a
   * failed part, so the preview stays and the DM may press Create again; it never throws for that.
   */
  create(): Promise<AskRunResult>;
  /**
   * The DM changed a row's `choice`: records it (so `create` saves it) and returns what to show now. Present only on
   * a preview whose rows carry choices.
   */
  choose?(key: string, value: string): AskPreviewShown;
}

/** The generation either made something to show, or ended with nothing (a failed part saying why). */
export type AskPreviewOutcome = { ok: true; preview: AskPreview } | { ok: false; result: AskRunResult };

export interface AskAdapter {
  /** The `ASK_GENERATORS` id. */
  id: string;
  /** The quote for this proposal. Pure over current state; call again when the proposal changes. */
  quote(proposal: AskProposal, choices?: AskChoices): AskQuote;
  /**
   * Runs it, generating and saving in one step. Called once per confirmed proposal: the panel keys runs by
   * `proposalId` and never calls twice for one, so a double press or a retry of the request cannot make a second
   * record. Resolves; never throws for a failed generation (that is a part with `ok: false`).
   */
  run(proposal: AskProposal, choices?: AskChoices): Promise<AskRunResult>;
  /**
   * The generator's route that asks no model (the NPC's "Quick create"): makes the record from the same inputs, spends
   * no credits, and ends in the same result card. Offered on the card only when present.
   */
  quick?(proposal: AskProposal, choices?: AskChoices): Promise<AskRunResult>;
}

/**
 * The two-phase adapter (#1270), for a generator whose result the DM looks at before it is kept (the encounter's
 * line-up, a table's rows). Same quote and gates as `AskAdapter`; instead of `run` it has `preview`, which generates
 * and returns what to show with the `create` that saves it. The gilt button charges at the generation; Create costs
 * nothing. `preview` is called once per press of the gilt button and once more per press of "Again", a deliberate new
 * generation at the quote's price.
 */
export interface AskPreviewAdapter extends Omit<AskAdapter, "run"> {
  preview(proposal: AskProposal, choices?: AskChoices): Promise<AskPreviewOutcome>;
}

/** Either shape: what the registry holds and the card and the conversation read. */
export type AnyAskAdapter = AskAdapter | AskPreviewAdapter;

/** True for a two-phase adapter. */
export function isPreviewAdapter(adapter: AnyAskAdapter): adapter is AskPreviewAdapter {
  return "preview" in adapter;
}

/** A `screen` generator has no quote and no run: Ask opens its screen with the request filled in. */
export interface AskScreenAdapter {
  id: string;
  route(proposal: AskProposal): string;
}
