import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

export type WayInStepId = "pitch" | "truths" | "force" | "secret";
export interface WayInStep {
  id: WayInStepId;
  done: boolean;
  /** How many of the wanted entries exist, on the step that wants several. */
  count?: number;
}

export const TRUTHS_WANTED = 3;

/** The four short steps that give a new canon ground to stand on, in order, each with whether it is done. */
export function wayInSteps(entries: readonly CanonEntry[], clues: readonly CanonClue[]): WayInStep[] {
  const truths = entries.filter((e) => e.part === "truth").length;
  const secretIds = new Set(clues.map((c) => c.secret_id));
  return [
    { id: "pitch", done: entries.some((e) => e.part === "premise" && e.premise_kind === "pitch" && tiptapToPlainText(e.body).trim() !== "") },
    { id: "truths", done: truths >= TRUTHS_WANTED, count: Math.min(truths, TRUTHS_WANTED) },
    { id: "force", done: entries.some((e) => e.part === "force") },
    { id: "secret", done: entries.some((e) => e.part === "secret" && secretIds.has(e.id)) },
  ];
}

/**
 * Entries beyond the premise past which a canon is established, whatever steps it skipped: the four steps add six. An
 * established canon with no clue yet (seven truths, four forces, no secrets) is not led in again in place of its chapters.
 */
export const ESTABLISHED_AT = 8;

/** A canon is new until all four steps are done, and only while it is still small. */
export function isNewCanon(entries: readonly CanonEntry[], steps: readonly WayInStep[]): boolean {
  return entries.filter((e) => e.part !== "premise").length < ESTABLISHED_AT && steps.some((s) => !s.done);
}
