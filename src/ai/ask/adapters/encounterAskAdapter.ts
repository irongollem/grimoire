/**
 * Ask Grimoire (#1253, #1270): the Encounter Generator, as a quote and a preview.
 *
 * The price is `useEncounterQuote`'s, the gates are the page's (`useAskGate`: AI off, a game system without stat
 * blocks, the encounters quota, the balance). The run is two steps (`preview`): `useGenerateEncounter` generates the
 * line-up and the card shows it, and only the DM's Create saves it. The version picker the panel had for a creature
 * that exists in several sourcebooks is not part of Ask: the encounter takes the resolver's pick and the DM can swap
 * it in the editor.
 *
 * `location_id` sets the encounter in a place of this campaign (the Atlas lists an encounter at its place), picked on
 * the card's Where or named by Ask, looked up in the campaign's own Atlas and ignored when it is not there. What
 * lives there (or its own encounter table) is the place's habitat, sent to the generator as the panel sent it. The
 * Atlas and the habitats are read only once a proposal names a place, because this adapter lives as long as the panel.
 *
 * A creature the Bestiary does not have is not a failure of the run: the encounter is saved and its description lists
 * the creatures to add by hand, which the result says in its own part.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskChoices, AskPreviewAdapter, AskPreviewOutcome, AskPreviewShown, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askChoice, conceptBlock, failedRun, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { useEncounterQuote } from "@/composables/ai/quotes/encounterQuote";
import { useAllLocations } from "@/composables/locations/useLocations";
import { unmatchedLabel, useGenerateEncounter, type EncounterDraft } from "@/composables/encounters/useGenerateEncounter";
import { useEncounterWhere } from "@/composables/encounters/useEncounterWhere";
import { timeOfDayOf } from "@/ai/ask/timeOfDay";
import { lifeConstraints } from "@/lib/canon/habitats";
import { swapCombatantVersion, type ResolvableMonster } from "@/lib/encounters/resolveGeneratedCombatants";
import { useSourceTitles } from "@/composables/library/useSourceTitles";

/** A draft with the DM's version picks applied, by the entry's position in the model's list (the one identity that survives a re-resolve). */
function withPicks(draft: EncounterDraft, picks: Readonly<Record<number, string>>): EncounterDraft {
  return { ...draft, matched: draft.matched.map((m) => (picks[m.entryIndex] ? swapCombatantVersion(m, picks[m.entryIndex]) : m)) };
}

/**
 * What the result card shows of a draft: the line-up with each creature's CR (and a version picker where the name
 * exists in several sourcebooks, #601: the CR is the point, since publishers rebalance), the model's notes, and what
 * the Bestiary lacks.
 */
function shownDraft(draft: EncounterDraft, versionLabel: (m: ResolvableMonster) => string): AskPreviewShown {
  const { result } = draft;
  const ambiguous = draft.matched.some((m) => m.candidates.length > 1);
  const lineUp = draft.matched.map((m) => ({
    label: `${m.def.count} × ${m.def.custom_name ?? m.monster.name}`,
    detail: `CR ${m.monster.challenge_rating}`,
    ...(m.candidates.length > 1
      ? { choice: { key: String(m.entryIndex), label: "Version", options: m.candidates.map((c) => ({ id: c.id, name: versionLabel(c) })), value: m.monster.id } }
      : {}),
  }));
  const notes = [
    { label: "Environment", detail: result.environment },
    { label: "Tactics", detail: result.tactics },
    { label: "Twist", detail: result.twist },
  ].filter((row) => row.detail);
  const difficulty = result.difficulty.charAt(0).toUpperCase() + result.difficulty.slice(1);
  return {
    title: result.name,
    badge: `${difficulty} for the party`,
    sections: [
      ...(lineUp.length > 0
        ? [{ heading: "Combatants", ...(ambiguous ? { hint: "Some of these exist in more than one of your sourcebooks: the version shown is the one the encounter will use." } : {}), rows: lineUp }]
        : []),
      ...(notes.length > 0 ? [{ rows: notes }] : []),
    ],
    ...(draft.unmatched.length > 0 ? { note: `Not in your Bestiary, to add by hand: ${draft.unmatched.map((u) => `${u.count} × ${unmatchedLabel(u)}`).join(", ")}` } : {}),
  };
}

export function useEncounterAskAdapter(): AskPreviewAdapter {
  const quoteEncounter = useEncounterQuote();
  const { labelFor } = useSourceTitles();

  /** One version of an ambiguous name for the picker: where it comes from, and its CR. A DM's own row is "Custom". */
  function versionLabel(m: ResolvableMonster): string {
    const origin = m.is_shared ? labelFor(m.source, m.source_title) : "Custom";
    return origin ? `${origin} · CR ${m.challenge_rating}` : `CR ${m.challenge_rating}`;
  }
  const { blockFor } = useAskGate("encounters", "encounter");
  const { generateEncounterDraft, saveEncounterDraft } = useGenerateEncounter();

  const lookupsWanted = ref(false);
  const { data: locations } = useAllLocations(() => lookupsWanted.value);
  // What lives in a place, asked per proposal (`habitatFor`) so two cards never share a place; read only once a place is named.
  const where = useEncounterWhere(() => null, () => lookupsWanted.value);
  const lookupsLoading = computed(() => lookupsWanted.value && locations.value === undefined);

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("encounter", proposal.inputs);
    const said = askString(inputs, "difficulty");
    const locationId = askString(inputs, "location_id");
    if (locationId !== null) lookupsWanted.value = true;
    return {
      location: locationId === null ? null : locations.value?.find((l) => l.id === locationId) ?? null,
      // The page's own default: the server resolves "auto" from the party.
      difficulty: said === null ? "auto" : said,
      // The hour decides who is about; "any" (the card's default) is no hour at all.
      timeOfDay: timeOfDayOf(askString(inputs, "time_of_day")),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal, choices?: AskChoices): AskQuote {
    const read = understand(proposal);
    const priced = quoteEncounter();

    const lines: AskQuoteLine[] = [{ label: "Difficulty", value: read.difficulty, credits: null }];
    if (read.location) lines.push({ label: "In", value: read.location.name, credits: null, choice: askChoice(choices, "location_id", true) });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, fiveE: true });
    block = block ?? conceptBlock(read.concept, "encounter", { empty: "Say what this encounter is first.", limit: AI_PROMPT_LIMIT_SHORT });
    if (!block && lookupsLoading.value) block = { reason: "missing", message: "Still reading this campaign's places." };
    // The place's habitat and tables load after the Atlas does: a run that went out before they arrived would roll with no habitat.
    const placeKept = read.location !== null && askChoice(choices, "location_id", true).on;
    if (!block && placeKept && !where.ready.value) block = { reason: "missing", message: "Still reading the place…" };
    return { lines, total: priced.total, block };
  }

  /**
   * Generates and holds the encounter for the DM to look at: the gilt button charges here, at the generation, and
   * `create` saves what was shown for nothing more. Straight into the editor afterwards, as the page did: a generated
   * encounter is a draft to review.
   */
  async function preview(proposal: AskProposal, choices?: AskChoices): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal, choices);
    if (current.block) return { ok: false, result: failedRun("Encounter", current.block.message) };
    const read = understand(proposal);
    // A place at no leaves the encounter unanchored, as if the proposal had not named one.
    const location = askChoice(choices, "location_id", true).on ? read.location : null;
    // What lives where the encounter is set, rolled once in code, at the card's hour and the campaign's season, and sent beside the concept.
    const habitat = location === null ? null : where.habitatFor(location.id, read.timeOfDay);
    const constraints = habitat === null ? [] : lifeConstraints(habitat);

    let outcome;
    try {
      outcome = await generateEncounterDraft(read.concept, { difficulty: read.difficulty, ...(constraints.length > 0 ? { constraints } : {}) });
    } catch (e) {
      return { ok: false, result: failedRun("Encounter", e instanceof Error ? e.message : "Encounter generation failed.") };
    }
    if (outcome.draft === null) return { ok: false, result: failedRun("Encounter", outcome.error) };
    const draft: EncounterDraft = outcome.draft;

    const parts: AskRunPart[] = [{ label: "Encounter", ok: true, credits: spent(current.lines.find((l) => l.label === "Encounter")) }];

    // The DM's version picks, by the entry's position in the model's list.
    const picks: Record<number, string> = {};

    async function create(): Promise<AskRunResult> {
      let saved;
      try {
        saved = await saveEncounterDraft(withPicks(draft, picks), location?.id ?? null);
      } catch (e) {
        return failedRun("Encounter", saveFailure(e, "encounters", "The encounter could not be saved."));
      }
      const made: AskRunPart[] = [...parts];
      if (draft.unmatched.length > 0) {
        made.push({
          label: "Creatures",
          ok: false,
          credits: 0,
          error: `${draft.unmatched.length} creature${draft.unmatched.length === 1 ? " is" : "s are"} not in your Bestiary. They are listed in the description to add by hand.`,
        });
      }
      return { record: { type: "encounter", id: saved.id, name: saved.name }, route: `/encounters/${saved.id}?edit=true`, parts: made };
    }

    function choose(key: string, value: string): AskPreviewShown {
      // The picker's clear hands back "": back to the default pick, not "no creature".
      if (value) picks[Number(key)] = value;
      else delete picks[Number(key)];
      return shownDraft(withPicks(draft, picks), versionLabel);
    }

    return { ok: true, preview: { shown: shownDraft(draft, versionLabel), parts, create, choose } };
  }

  return { id: "encounter", quote, preview };
}

export default useEncounterAskAdapter;
