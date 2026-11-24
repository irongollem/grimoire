/**
 * The preview step of Ask Grimoire (#1270): a generation held for the DM's yes, and the presses on it (Create, Again,
 * Discard, a choice, one row). `launch` in the conversation makes the preview and hands it to `hold`; everything after
 * is here. State lives in the caller's thread (its `items` and its `held` map); nothing is module-level.
 */
import { computed } from "vue";
import { askGenerator } from "@edge-shared/agent/askContract";
import { isPreviewAdapter, type AskRunResult } from "@/lib/ask/askAdapter";
import type { AskAdapters } from "@/ai/ask/useAskAdapters";
import { askGeneratorList } from "./askRecordRoute";
import { findItem, partsCredits, previewRowKey, type AskItem, type AskThreadState } from "./askItems";

type ProposalItem = Extract<AskItem, { kind: "proposal" }>;

export interface AskPreviewsDeps {
  /** The thread on screen, reactive: what `generating` and `holding` read. */
  items: { value: AskItem[] };
  /** The thread a press is made in: its held previews and its items. Read at the press, so a switch of campaign during it cannot move it. */
  thread: () => AskThreadState;
  /** Whether a thread is still its campaign's live one: false once the DM started it over, so a late press writes nothing into it. */
  alive: (thread: AskThreadState) => boolean;
  adapters: AskAdapters;
  /** A finished run's end (the result card and the panel's notice), in the thread it started in. */
  land: (thread: AskThreadState, item: ProposalItem, result: AskRunResult, from: { startedAt: string; campaignName: string; credits: number }) => void;
}

export function useAskPreviews(deps: AskPreviewsDeps) {
  const { items } = deps;

  /** Whether any row of a preview stands in `phase`: a row press under way spends credits and writes a record like any other. */
  function hasRow(card: Extract<AskItem, { kind: "preview" }>, phase: "running" | "done"): boolean {
    return Object.values(card.rows).some((r) => r.phase === phase);
  }

  /**
   * A generation is in flight (a run under way, or a held generation being saved or redone): credits are being spent
   * and the result has nowhere to land but this thread, so starting over must wait for it.
   */
  const generating = computed(() => items.value.some((i) => (i.kind === "proposal" && i.state === "running") || (i.kind === "preview" && (i.phase === "saving" || i.phase === "again" || hasRow(i, "running")))));
  /** What the DM has generated and not saved ("encounter"): starting over would lose it, credits and all; null when nothing is waiting. */
  const holding = computed(() => {
    const waiting = items.value.find((i) => i.kind === "preview" && i.phase === "ready");
    if (!waiting || waiting.kind !== "preview") return null;
    const owner = items.value.find((i) => i.id === waiting.proposalItemId);
    return (owner?.kind === "proposal" && askGenerator(owner.proposal.generator)?.noun) || "result";
  });

  /** What a failed part says, for a save that did not happen. */
  function failureOf(result: AskRunResult): string {
    return result.parts.find((p) => !p.ok && p.error)?.error ?? "It could not be saved.";
  }

  /**
   * Create on a held generation: saves it, then the usual result. Nothing is charged here (the generation was).
   * `phase` is the guard: a second press, or a press while "Again" runs, finds it no longer `ready` and does nothing,
   * so one preview makes one record.
   */
  async function createPreview(previewId: number) {
    const thread = deps.thread();
    const card = findItem(thread.items, previewId, "preview");
    const keep = thread.held.get(previewId);
    if (!card || !keep || card.phase !== "ready") return;
    // A row's own press is still under way: its record would be missing from what Create summarises.
    if (hasRow(card, "running")) return;
    const item = findItem(thread.items, keep.proposalItemId, "proposal");
    if (!item) return;
    card.phase = "saving";
    card.error = undefined;
    let result: AskRunResult;
    try {
      result = await keep.preview.create();
    } catch {
      // Whether it saved is UNKNOWN (the insert may have gone through before the connection dropped), so Create is not
      // offered again: a second press could make a duplicate. The card says so and links the list; Discard stays, and the
      // fold says it did not finish (which also takes "Change options" away). Only a create that RESOLVES with no record is
      // a known non-save, and stays retryable below.
      card.phase = "failed";
      card.error = "It may have been saved. Check the list before making it again.";
      const list = askGeneratorList(item.proposal.generator);
      if (list) card.listRoute = list;
      item.state = "failed";
      return;
    }
    if (result.record === null) {
      // Nothing was saved: the preview stays, and Create can be pressed again.
      card.phase = "ready";
      card.error = failureOf(result);
      return;
    }
    card.phase = "saved";
    thread.held.delete(previewId);
    deps.land(thread, item, result, { startedAt: keep.startedAt, campaignName: keep.campaignName, credits: item.credits ?? partsCredits(result.parts) });
  }

  /**
   * "Again": a deliberate new generation from the same inputs (as the DM has them now), at the quote's price. It has
   * its own guard, the phase: while it runs the card is not `ready`, so a double press is one generation. It replaces
   * what was shown; what the earlier one cost stays spent and is added to the folded line.
   */
  async function againPreview(previewId: number) {
    const thread = deps.thread();
    const card = findItem(thread.items, previewId, "preview");
    const keep = thread.held.get(previewId);
    if (!card || !keep || card.phase !== "ready") return;
    // A press on a row made a record from this generation, and a second generation would orphan it (the adapter's own
    // record of what was built belongs to the one shown). A save of unknown outcome is the same: check the list first.
    if (hasRow(card, "running") || hasRow(card, "done")) return;
    const item = findItem(thread.items, keep.proposalItemId, "proposal");
    if (item?.state === "failed") return;
    const adapter = item ? deps.adapters.adapterFor(item.proposal.generator) : undefined;
    if (!item || !adapter || !isPreviewAdapter(adapter)) return;
    // The gates again: a balance spent since, or a plan limit reached, says no before a second charge.
    const quote = adapter.quote(item.proposal, item.choices);
    if (quote.block !== null || quote.total === null) {
      card.error = quote.block?.message ?? "The price is not known yet.";
      return;
    }
    card.phase = "again";
    card.error = undefined;
    let outcome;
    try {
      outcome = await adapter.preview(item.proposal, { ...item.choices });
    } catch {
      card.phase = "ready";
      card.error = "That did not finish. Check your credits before asking again.";
      return;
    }
    if (!outcome.ok) {
      card.phase = "ready";
      card.error = failureOf(outcome.result);
      return;
    }
    item.credits = (item.credits ?? 0) + partsCredits(outcome.preview.parts);
    thread.held.set(previewId, { ...keep, preview: outcome.preview });
    card.shown = outcome.preview.shown;
    card.rows = {};
    card.phase = "ready";
  }

  /**
   * A press on one row of the held generation ("Create quest" on a hook, "Said it" on a line). The row's own state is
   * the guard: a second press while it runs, or after it is done, finds it taken and does nothing, so one row makes
   * one record. The preview stays `ready`, so the other rows can be pressed; a failed row says why and may be pressed
   * again. Credits a row spends are added to the folded line, as an "Again" adds its own.
   */
  async function actOnRow(previewId: number, section: number, row: number) {
    const thread = deps.thread();
    const card = findItem(thread.items, previewId, "preview");
    const keep = thread.held.get(previewId);
    if (!card || !keep || card.phase !== "ready") return;
    const key = previewRowKey(section, row);
    const state = card.rows[key];
    if (state?.phase === "running" || state?.phase === "done") return;
    const action = card.shown.sections[section]?.rows[row]?.action;
    if (!action) return;
    card.rows[key] = { phase: "running" };
    const item = findItem(thread.items, keep.proposalItemId, "proposal");
    let part: Awaited<ReturnType<typeof action.run>>;
    try {
      part = await action.run();
    } catch {
      if (!deps.alive(thread)) return;
      card.rows[key] = { phase: "failed", error: "That did not finish. Check the list before pressing again." };
      return;
    }
    if (!deps.alive(thread)) return;
    if (!part.ok) {
      card.rows[key] = { phase: "failed", error: part.error ?? "That did not work." };
      return;
    }
    if (item && part.credits > 0) item.credits = (item.credits ?? 0) + part.credits;
    card.rows[key] = { phase: "done", doneLabel: action.doneLabel, ...(part.links ? { links: part.links } : {}), ...(part.error ? { error: part.error } : {}) };
  }

  /** A choice on a row of the held generation (a creature's version): the preview records it and `create` saves it. */
  function choosePreview(previewId: number, key: string, value: string) {
    const thread = deps.thread();
    const card = findItem(thread.items, previewId, "preview");
    const keep = thread.held.get(previewId);
    if (!card || !keep || card.phase !== "ready" || !keep.preview.choose) return;
    card.shown = keep.preview.choose(key, value);
  }

  /** Discard: ends the held generation with nothing saved. What it cost is spent; the card says so. */
  function discardPreview(previewId: number) {
    const thread = deps.thread();
    const card = findItem(thread.items, previewId, "preview");
    const keep = thread.held.get(previewId);
    if (!card || !keep || (card.phase !== "ready" && card.phase !== "failed")) return;
    // A row press under way would finish after this and be missing from `kept`: wait for it, as Create and Again do.
    if (hasRow(card, "running")) return;
    card.phase = "discarded";
    thread.held.delete(previewId);
    // What a row press already made stays made: the card says so instead of "Nothing was saved".
    const kept = Object.values(card.rows).filter((r) => r.phase === "done").length;
    if (kept > 0) card.kept = kept;
    const item = findItem(thread.items, keep.proposalItemId, "proposal");
    if (item) {
      item.state = "discarded";
      if (kept > 0) item.kept = kept;
    }
  }

  return { generating, holding, createPreview, againPreview, actOnRow, choosePreview, discardPreview };
}
