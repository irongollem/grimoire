/**
 * The shapes of an Ask thread (#1253, #1270): the items the panel draws, and the small helpers about them. Split from
 * `useAskConversation` so the conversation and its preview step (`useAskPreviews`) share them without importing each other.
 */
import { askGenerator, type AskChoice, type AskIdea, type AskProposal, type AskRecordRef, type AskReportDraft } from "@edge-shared/agent/askContract";
import type { AskPreview, AskPreviewShown, AskQuote, AskResultLink, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";

export type ResultPart = AskRunPart & { left?: boolean; retrying?: boolean };

/** Where one row's own press stands: under way, done (with the links it left), or failed (the row may be pressed again). */
export interface PreviewRowState {
  phase: "running" | "done" | "failed";
  doneLabel?: string;
  links?: AskResultLink[];
  /** On a failed row, why; on a done row, a quiet note the press came back with. */
  error?: string;
}

/** A row of a preview is named by its place: the section and the row in it. */
export const previewRowKey = (section: number, row: number) => `${section}:${row}`;

export type AskItem =
  | { kind: "user"; id: number; text: string }
  | { kind: "reply"; id: number; text: string; who: string | null }
  | { kind: "ask"; id: number; question: string; choices: AskChoice[]; answered: boolean }
  | { kind: "read"; id: number; records: AskRecordRef[] }
  | { kind: "ideas"; id: number; ideas: AskIdea[]; handedOff: number[] }
  | {
      kind: "proposal";
      id: number;
      proposal: AskProposal;
      state: "quote" | "cancelled" | "running" | "previewing" | "discarded" | "done" | "failed";
      /** On a discarded generation, how many of its rows had already been made and kept: the fold does not say "nothing was saved". */
      kept?: number;
      /** What the generation cost so far, the folded line's price: each "Again" adds its own. Set once it has run. */
      credits?: number;
      /** The DM's yes or no to each line that would change an existing record; read by the quote and the run. */
      choices: Record<string, boolean>;
      /** Set when a page's button opened the card, so the DM fills it in; a card the model proposed has no such mark. */
      origin?: "button";
      /**
       * Where the finished run landed: a run never holds up the conversation, so its result (or its failure) is added
       * at the bottom when it ends, and the proposal's own place links to it.
       */
      landedAt?: number;
    }
  /**
   * A generation held for the DM's yes (#1270): what it made, not saved yet. `ready` waits for Create, Again or
   * Discard; the other phases are a press under way or its end.
   */
  | {
      kind: "preview";
      id: number;
      proposalItemId: number;
      phase: "ready" | "saving" | "again" | "saved" | "discarded" | "failed";
      shown: AskPreviewShown;
      /** The rows whose own press has run or is running, by `previewRowKey`; cleared when "Again" replaces what is shown. */
      rows: Record<string, PreviewRowState>;
      /** A save or a second generation that did not work, said for the DM; the preview stays as it was. */
      error?: string;
      /** Once discarded, how many records its row presses had already made: they stay. */
      kept?: number;
    }
  /** A report Ask drafted. Nothing is sent: the DM reviews it in the report form and presses Send there. */
  | { kind: "report"; id: number; report: AskReportDraft }
  | { kind: "confirmed"; id: number; text: string }
  | {
      kind: "result";
      id: number;
      name: string;
      noun: string;
      review: boolean;
      record: AskRunResult["record"];
      route: string | null;
      /** More ways in, beside the main Open. */
      links?: AskResultLink[];
      /** A result that lives in the page's own panel: opened there after navigating to `route`. */
      open?: () => void;
      /** The picture the run made, shown on the card. */
      picture?: string;
      parts: ResultPart[];
    }
  | { kind: "upsell"; id: number }
  | { kind: "error"; id: number; message: string };

export type ReplyItem = Extract<AskItem, { kind: "reply" }>;
export type NewItem = AskItem extends infer T ? (T extends { id: number } ? Omit<T, "id"> : never) : never;

export function partsCredits(parts: readonly AskRunPart[]): number {
  return parts.reduce((sum, p) => sum + p.credits, 0);
}

/** What a discard says when row presses had already made records: "2 quests were made and kept." */
export function keptLine(kept: number, noun: string): string {
  return `${kept} ${noun}${kept === 1 ? "" : "s"} ${kept === 1 ? "was" : "were"} made and kept.`;
}

/** A required concept still empty on a card a button opened: the quote's "missing" block is then the empty box, not a load. */
export function isWaitingForWords(item: Extract<AskItem, { kind: "proposal" }>, quote: AskQuote | null): boolean {
  const concept = item.origin === "button" ? askGenerator(item.proposal.generator)?.concept : undefined;
  return concept?.required === true && item.proposal.concept.trim() === "" && quote?.block?.reason === "missing";
}

/**
 * Quick create waits while the quote is still reading what its inputs name (places, factions, people, ties): it is free
 * and ignores a credit or plan block, but a press before those lists arrive would drop the ids they resolve. An empty
 * required concept is not a load and does not hold it.
 */
export function quickWaitsOnLoad(item: Extract<AskItem, { kind: "proposal" }>, quote: AskQuote | null): boolean {
  if (quote === null) return false;
  return quote.reading === true || (quote.block?.reason === "missing" && !isWaitingForWords(item, quote));
}

/** A generation held for the DM's yes: the call that saves it, and what the run's finish needs to say. */
export interface HeldPreview {
  preview: AskPreview;
  proposalItemId: number;
  startedAt: string;
  campaignName: string;
}

/**
 * One campaign's conversation: what is on screen, the previews held for a yes, and the server session. A thread belongs
 * to its campaign, so switching away parks it and switching back restores it; a run or an "Again" that finishes after the
 * switch writes into the thread it started in (`items` is a reactive array, so a write to a parked one is seen on return).
 */
export interface AskThreadState {
  campaignId: string;
  items: AskItem[];
  held: Map<number, HeldPreview>;
  sessionId: string | undefined;
}

export function findItem<K extends AskItem["kind"]>(items: AskItem[], id: number, kind: K): Extract<AskItem, { kind: K }> | undefined {
  return items.find((i): i is Extract<AskItem, { kind: K }> => i.id === id && i.kind === kind);
}
