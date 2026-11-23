import type { CanonEntryPatch, NewCanonEntry } from "@/composables/canon/useCanonEntries";
import type { CanonEntry, KnowledgeMark } from "@/types/canon.types";

/**
 * Ending a canon entry (#1255 items 9 and 10). A question is answered; a force gets what it wanted, is stopped or
 * fades. A part never changes, so an answer is a new entry and the question points at it (`became_entry_id`).
 */

/** What an answered question became: a truth with a knowledge mark, or a secret to uncover. */
export type AnswerKind = KnowledgeMark | "secret-to-uncover";

export const ANSWER_OPTIONS: ReadonlyArray<{ value: AnswerKind; label: string }> = [
  { value: "all", label: "A truth all know" },
  { value: "some", label: "A truth some know" },
  { value: "secret", label: "A secret truth" },
  { value: "secret-to-uncover", label: "A secret to uncover" },
];

/** The new entry an answer becomes, titled with the answer itself. */
export function answerEntry(answer: string, kind: AnswerKind): NewCanonEntry {
  const title = answer.trim();
  return kind === "secret-to-uncover" ? { part: "secret", title } : { part: "truth", knowledge: kind, title };
}

/** The write that closes the question once its answer exists. All four columns go together: the table checks them as a set. */
export function answeredPatch(answer: string, becameId: string, now: string): CanonEntryPatch {
  return { closed_as: "answered", closed_at: now, closed_note: answer.trim(), became_entry_id: becameId };
}

/**
 * Reopening a question clears all four. `closed_note` must go with `closed_as` or the table refuses the write
 * (23514); the entry the answer became is left alone.
 */
export const REOPEN_QUESTION_PATCH: CanonEntryPatch = { closed_as: null, closed_at: null, closed_note: null, became_entry_id: null };

export const FORCE_OUTCOMES = ["succeeded", "stopped", "faded"] as const;
export type ForceOutcome = (typeof FORCE_OUTCOMES)[number];

/** The choice's label, in the DM's words. */
export const FORCE_OUTCOME_LABEL: Record<ForceOutcome, string> = {
  succeeded: "It got what it wanted",
  stopped: "It was stopped",
  faded: "It faded away",
};

/** What a ledger row and the detail's banner say once it ended. */
export const FORCE_OUTCOME_ENDED: Record<ForceOutcome, string> = {
  succeeded: "Ended: it got what it wanted",
  stopped: "Ended: it was stopped",
  faded: "Ended: it faded away",
};

export const FORCE_OUTCOME_OPTIONS: ReadonlyArray<{ value: ForceOutcome; label: string }> = FORCE_OUTCOMES.map((value) => ({
  value,
  label: FORCE_OUTCOME_LABEL[value],
}));

/** The write that ends a force. An empty note is stored as no note. */
export function endForcePatch(outcome: ForceOutcome, note: string, now: string): CanonEntryPatch {
  const trimmed = note.trim();
  return { closed_as: outcome, closed_at: now, closed_note: trimmed === "" ? null : trimmed };
}

/**
 * Setting a force moving again clears the three columns together, as the table requires, and the pointer to the truth
 * it became: a force that moves again has not become anything. The truth is left standing, as a reopened question's is.
 */
export const RESUME_FORCE_PATCH: CanonEntryPatch = { closed_as: null, closed_at: null, closed_note: null, became_entry_id: null };

/** What ending a force writes, one step each, so the caller can wire real mutations and a test can wire fakes. */
export interface EndForceWriters {
  /** Makes the truth the force left behind. */
  createTruth: (input: NewCanonEntry) => Promise<{ id: string }>;
  /** Writes the closing patch on the force. */
  updateForce: (patch: CanonEntryPatch) => Promise<void>;
  /** Ties the force to the truth with a `led_to` link. */
  linkLedTo: (truthId: string, title: string) => Promise<void>;
}

/**
 * Ending a force (#1258 item 10). With no "What is true now?" line it writes the outcome and the note, as ever. With one,
 * the truth is made first (known to all), then the force closes pointing at it, then the two are tied `led_to`: a failed
 * truth leaves the force moving, and a failed link leaves a closed force that still points at its truth, reported back
 * rather than thrown so the caller can say so. A blank line counts as none.
 */
export async function endForce(
  outcome: ForceOutcome,
  note: string,
  trueNow: string,
  now: string,
  writers: EndForceWriters,
): Promise<{ linkError: Error | null }> {
  const title = trueNow.trim();
  const patch = endForcePatch(outcome, note, now);
  if (title === "") {
    await writers.updateForce(patch);
    return { linkError: null };
  }
  const truth = await writers.createTruth({ part: "truth", knowledge: "all", title });
  await writers.updateForce({ ...patch, became_entry_id: truth.id });
  try {
    await writers.linkLedTo(truth.id, title);
  } catch (error) {
    return { linkError: error instanceof Error ? error : new Error(String(error)) };
  }
  return { linkError: null };
}

/** The force's outcome when it has ended, else null. A force's `closed_as` is never `answered`; that is the table's rule. */
export function forceOutcome(force: Pick<CanonEntry, "closed_as">): ForceOutcome | null {
  const closed = force.closed_as;
  return closed === "succeeded" || closed === "stopped" || closed === "faded" ? closed : null;
}
