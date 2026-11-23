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

/** One line of the quote card: what, the value Ask understood, and its price (null for a line with no price). */
export interface AskQuoteLine {
  label: string;
  value: string;
  credits: number | null;
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
  /** The campaign runs this on the DM's own key: no credits are spent. */
  byok: boolean;
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
}

export interface AskRunResult {
  /** The record made or filled; null when nothing was saved. */
  record: { type: AskRecordType | "other"; id: string; name: string } | null;
  /** Where "Open <noun>" or "Review suggestions" goes. */
  route: string | null;
  parts: AskRunPart[];
}

export interface AskAdapter {
  /** The `ASK_GENERATORS` id. */
  id: string;
  /** The quote for this proposal. Pure over current state; call again when the proposal changes. */
  quote(proposal: AskProposal): AskQuote;
  /**
   * Runs it. Called once per confirmed proposal: the panel keys runs by `proposalId` and never calls twice for one,
   * so a double press or a retry of the request cannot make a second record. Resolves; never throws for a failed
   * generation (that is a part with `ok: false`).
   */
  run(proposal: AskProposal): Promise<AskRunResult>;
}

/** A `screen` generator has no quote and no run: Ask opens its screen with the request filled in. */
export interface AskScreenAdapter {
  id: string;
  route(proposal: AskProposal): string;
}
