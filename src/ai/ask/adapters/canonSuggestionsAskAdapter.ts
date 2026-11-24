/**
 * Ask Grimoire (#1253, #1267): suggested canon, as a quote and a run that ends where the chapter's own review is.
 *
 * The Canon has no AI of its own; its Suggest buttons open the Familiar with a written request. Which helper runs is
 * decided from that request, not asked of the model (the contract has no mode): the words name it (clues, questions,
 * forces or steps, secrets, premise, lore, a read of the whole canon), and truths are the rest. A request that names an
 * entry in double quotes ("the secret \"X\"") is looked up by title, and a title the canon does not hold fails the quote
 * rather than suggesting for nothing.
 *
 * The suggestions are `useCanonSuggestions`' module state, keyed by mode and scope (a secret's id for its clues, an
 * entry's id for a lore split, `new` for a lore draft): the chapter mounts `CanonReview` on the same key, so the
 * proposals are on screen the moment the DM follows the route. Nothing is written until the DM accepts one there.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { useAskGate } from "@/ai/ask/useAskGate";
import { countWord } from "@/ai/ask/adapters/suggestionCount";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useCanonSuggestions, type CanonSuggestionMode } from "@/ai/useCanonSuggestions";
import { useCampaignStore } from "@/stores/campaign";
import { useCanonSuggestionsQuote } from "@/composables/ai/quotes/canonSuggestionsQuote";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { chapterOf, type CanonSectionId } from "@/lib/canon/canonParts";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CanonEntry, CanonPart } from "@/types/canon.types";

/** A lore draft's title is the first line of what the DM said, cut to a title's length. */
const LORE_TITLE_LIMIT = 80;

/** The chapter each helper's proposals land in. */
const CHAPTER_OF_MODE: Record<CanonSuggestionMode, CanonSectionId> = {
  premise: "premise",
  truths: "truths",
  clues: "secrets",
  questions: "secrets",
  forces: "moving",
  secrets: "secrets",
  lore: "lore",
  read: "premise",
};

/** What a request that names an entry in quotes is naming, by mode. */
const PART_OF_MODE: Partial<Record<CanonSuggestionMode, { part: CanonPart; noun: string }>> = {
  clues: { part: "secret", noun: "secret" },
  forces: { part: "force", noun: "force" },
  lore: { part: "lore", noun: "lore entry" },
};

const QUOTED = /["“]([^"”]+)["”]/;

/** The title a request names in double quotes, or null. */
function quotedTitle(concept: string): string | null {
  const found = QUOTED.exec(concept);
  const title = found?.[1]?.trim();
  return title ? title : null;
}

/**
 * The helper a request asks for. The words are read with the quoted title taken out, so a lore entry called "The Force
 * of Names" is still lore. Clues need a secret named in quotes, or no mention of secrets at all ("a secret, with
 * clues" is a secret, whose clues come with it); a read is tested first, its words being the most particular.
 */
export function canonModeFor(concept: string): CanonSuggestionMode {
  const words = concept.replace(new RegExp(QUOTED.source, "g"), " ");
  if (/contradict|loose|hold together|read (?:my|the) (?:whole )?canon/i.test(words)) return "read";
  if (/\bclues?\b/i.test(words) && (quotedTitle(concept) !== null || !/\bsecrets?\b/i.test(words))) return "clues";
  if (/\bquestions?\b/i.test(words)) return "questions";
  if (/\bforces?\b|\bsteps?\b/i.test(words)) return "forces";
  if (/\bsecrets?\b/i.test(words)) return "secrets";
  if (/\bpremise\b|\bpitch\b|\bthemes?\b/i.test(words)) return "premise";
  if (/\blore\b|\bpassage/i.test(words)) return "lore";
  return "truths";
}

export function loreTitleFrom(concept: string): string {
  const firstLine = concept.trim().split("\n")[0]?.trim() ?? "";
  return firstLine.slice(0, LORE_TITLE_LIMIT).trim();
}

/** What a helper is run for: its key, what it sends besides the steer, and where its proposals are reviewed. */
export type CanonTarget =
  | { ok: true; mode: CanonSuggestionMode; scope: string | undefined; input: { secret_id: string } | { title: string; lore_kind?: CanonEntry["lore_kind"]; text?: string } | undefined; chapter: CanonSectionId; entryId: string | null }
  | { ok: false; message: string };

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Reads a request against the canon: the helper, the entry it names, and where the result is reviewed. */
export function resolveCanonRequest(concept: string, entries: readonly CanonEntry[] | undefined): CanonTarget {
  const mode = canonModeFor(concept);
  const chapter = CHAPTER_OF_MODE[mode];
  const named = quotedTitle(concept);
  const wanted = PART_OF_MODE[mode];

  if (wanted === undefined || (named === null && mode !== "clues")) {
    return {
      ok: true,
      mode,
      scope: mode === "lore" ? "new" : undefined,
      input: mode === "lore" ? { title: loreTitleFrom(concept) } : undefined,
      chapter,
      entryId: null,
    };
  }
  if (named === null) {
    return { ok: false, message: `Say which ${wanted.noun} in double quotes, like: Suggest clues for the ${wanted.noun} "The drowned king".` };
  }
  if (entries === undefined) return { ok: false, message: "Your canon is still loading. Try again in a moment." };
  const found = entries.find((e) => e.part === wanted.part && sameTitle(e.title, named));
  if (!found) return { ok: false, message: `There is no ${wanted.noun} titled "${named}" in your canon.` };

  if (mode === "clues") return { ok: true, mode, scope: found.id, input: { secret_id: found.id }, chapter, entryId: found.id };
  if (mode === "lore") {
    const text = tiptapToPlainText(found.body);
    return { ok: true, mode, scope: found.id, input: { title: found.title, lore_kind: found.lore_kind, ...(text.trim() !== "" ? { text } : {}) }, chapter, entryId: found.id };
  }
  // The next steps of a force arrive as forces to review in the chapter's list, so the route does not open the entry.
  return { ok: true, mode, scope: undefined, input: undefined, chapter, entryId: null };
}

const NOUN: Record<CanonSuggestionMode, [one: string, many: string]> = {
  premise: ["premise suggestion is", "premise suggestions are"],
  truths: ["truth suggestion is", "truth suggestions are"],
  clues: ["clue suggestion is", "clue suggestions are"],
  questions: ["question suggestion is", "question suggestions are"],
  forces: ["force suggestion is", "force suggestions are"],
  secrets: ["secret suggestion is", "secret suggestions are"],
  lore: ["lore suggestion is", "lore suggestions are"],
  read: ["finding is", "findings are"],
};

export function useCanonSuggestionsAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useCanonSuggestionsQuote();
  const { blockFor } = useAskGate(null, "canon suggestion");
  const { data: entries } = useCanonEntries();

  function quote(proposal: AskProposal): AskQuote {
    const concept = proposal.concept.trim();
    const target = resolveCanonRequest(concept, entries.value);
    const priced = quoteFor(target.ok ? target.mode : "truths");

    const lines: AskQuoteLine[] = [
      { label: "Part of the canon", value: target.ok && target.mode === "read" ? "The whole canon" : chapterOf(target.ok ? target.chapter : "truths").label, credits: null },
      { label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null },
      ...priced.lines,
    ];

    let block = blockFor({ total: priced.total, byok: priced.byok });
    block = block ?? conceptBlock(concept, "canon", { empty: "Say what the canon should be about first." });
    if (block === null && !target.ok) block = { reason: "missing", message: target.message };
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Canon suggestions", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Canon suggestions", "Another generation is already in progress.");
    const concept = proposal.concept.trim();
    const target = resolveCanonRequest(concept, entries.value);
    if (!target.ok) return failedRun("Canon suggestions", target.message);

    const helper = useCanonSuggestions(target.mode, target.scope);
    try {
      const ok = await (helper.suggest as (steer: string, input?: object) => Promise<boolean>)(concept, target.input);
      if (!ok) return failedRun("Canon suggestions", helper.error.value ?? "The suggestions could not be written.");
    } catch (e) {
      return failedRun("Canon suggestions", e instanceof Error ? e.message : "The suggestions could not be written.");
    }

    const made = helper.suggestions.value.length;
    const credits = current.total === null ? 0 : current.total;
    if (target.mode === "read") {
      const label = made === 0 ? "The read found nothing to report." : `${countWord(made)} ${NOUN.read[made === 1 ? 0 : 1]} ready.`;
      return { record: null, route: chapterRoute(target), parts: [{ label, ok: true, credits }] };
    }
    // A run whose every suggestion was set aside is not charged (the server holds and releases the credits).
    if (made === 0) return failedRun("Canon suggestions", "Every suggestion was set aside, so nothing was charged. Try a different steer.");
    const label = `${countWord(made)} ${NOUN[target.mode][made === 1 ? 0 : 1]} ready.`;
    return { record: null, route: chapterRoute(target), parts: [{ label, ok: true, credits }] };
  }

  return { id: "canon_suggestions", quote, run };
}

/** The chapter, and the entry in it when the proposals are reviewed on one; a read is shown above whichever chapter is open. */
function chapterRoute(target: Extract<CanonTarget, { ok: true }>): string {
  if (target.mode === "read") return "/canon";
  return target.entryId === null ? `/canon/${target.chapter}` : `/canon/${target.chapter}?entry=${target.entryId}`;
}

export default useCanonSuggestionsAskAdapter;
