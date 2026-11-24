/**
 * Ask Grimoire (#1253, #1270): the Class Generator, as a quote and a preview.
 *
 * The price is `useClassQuote`'s, the gates are the page's (`useAskGate`, which also refuses a campaign whose game
 * system has no 5e rules). The run is two steps (`preview`): `useGenerateCustomClass` generates the class and its
 * abilities and the card shows "what this will create", and only the DM's Create writes them (the abilities first,
 * then the class; a failed write removes the abilities already made). The hit die and the spellcasting are the card's
 * own chips, matched against the page's lists; a value those lists do not offer is not understood. A class has no
 * picture.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome, AskPreviewShown, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchKey, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useClassQuote } from "@/composables/ai/quotes/classQuote";
import { useGenerateCustomClass } from "@/composables/rules/useGenerateCustomClass";
import { CASTER_PROGRESSIONS, CASTER_PROGRESSION_LABELS, HIT_DICE, featureCountsByBand, type CasterProgression, type ClassDraft } from "@/lib/codex/classAi";
import type { HitDie } from "@/levelup/customTypes";

/** What the card shows of a class that is not saved yet: its body, its spellcasting, and the abilities by band. */
function shownClass(draft: ClassDraft): AskPreviewShown {
  const { base } = draft;
  const made = draft.features.filter((f) => "insert" in f).length;
  const bands = featureCountsByBand(draft.features).filter((b) => b.count > 0);
  return {
    title: base.class_name,
    badge: `d${base.hit_die} hit die`,
    sections: [
      {
        rows: [
          { label: "Saving throws", detail: base.saving_throws.join(" and ") },
          { label: "Subclass", detail: `at level ${base.subclass_level}` },
          { label: "Spellcasting", detail: CASTER_PROGRESSION_LABELS[draft.progression] },
        ],
      },
      { heading: `${made} ${made === 1 ? "ability" : "abilities"}`, rows: bands.map((b) => ({ label: b.label, detail: String(b.count) })) },
    ],
    ...(draft.warnings.length > 0 ? { note: draft.warnings.join(" ") } : {}),
  };
}

export function useClassAskAdapter(): AskPreviewAdapter {
  const campaign = useCampaignStore();
  const quoteClass = useClassQuote();
  const { blockFor } = useAskGate(null, "class");
  const { generateClassDraft, createClassFromDraft } = useGenerateCustomClass();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("class", proposal.inputs);
    const die = Number(askString(inputs, "hit_die"));
    const hitDie: HitDie | null = HIT_DICE.find((d) => d === die) ?? null;
    return { hitDie, progression: matchKey<CasterProgression>(askString(inputs, "caster_progression"), CASTER_PROGRESSIONS), concept: proposal.concept.trim() };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteClass();

    const lines: AskQuoteLine[] = [];
    if (read.hitDie) lines.push({ label: "Hit die", value: `d${read.hitDie}`, credits: null });
    if (read.progression) lines.push({ label: "Spellcasting", value: CASTER_PROGRESSION_LABELS[read.progression], credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    const block = blockFor({ total: priced.total, fiveE: true }) ?? conceptBlock(read.concept, "class");
    return { lines, total: priced.total, block };
  }

  /**
   * Generates and holds the class for the DM to look at: the gilt button charges here, at the generation, and `create`
   * writes what was shown for nothing more.
   */
  async function preview(proposal: AskProposal): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return { ok: false, result: failedRun("Class text", current.block.message) };
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateClassDraft(read.concept, { hitDie: read.hitDie ?? undefined, casterProgression: read.progression ?? undefined });
    } catch (e) {
      return { ok: false, result: failedRun("Class text", e instanceof Error ? e.message : "Class generation failed.") };
    }
    if (outcome.draft === null) return { ok: false, result: failedRun("Class text", outcome.error ?? "Class generation failed.") };
    const draft: ClassDraft = outcome.draft;

    const parts: AskRunPart[] = [{ label: "Class text", ok: true, credits: spent(current.lines.find((l) => l.label === "Class text")) }];

    async function create(): Promise<AskRunResult> {
      let created;
      try {
        created = await createClassFromDraft(draft);
      } catch (e) {
        return failedRun("Class text", saveFailure(e, "classes", "The class could not be saved."));
      }
      const made: AskRunPart[] = [...parts];
      // Left out of the class without stopping it (the official Ability Score Improvement missing): the DM should know.
      for (const warning of draft.warnings) made.push({ label: "Note", ok: false, credits: 0, error: warning });
      return { record: { type: "other", id: created.id, name: draft.base.class_name }, route: `/levelup/classes/${created.id}`, parts: made };
    }

    return { ok: true, preview: { shown: shownClass(draft), parts, create } };
  }

  return { id: "class", quote, preview };
}

export default useClassAskAdapter;
