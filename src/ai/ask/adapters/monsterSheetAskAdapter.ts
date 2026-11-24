/**
 * Ask Grimoire (#1270): the monster editor's own Generate, as a card in the Familiar that fills the open sheet.
 *
 * Same generation (`useMonsterGeneration`, the editor dialog's) and price (`useMonsterQuote`) as the monster
 * generator; nothing is created, the stat block goes to the form the page registered (`useAskFormFill`). No quota gate:
 * no record is made. Needs a game system with stat blocks, as the editor does.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { formClosedBlock, landInForm } from "@/ai/ask/adapters/formFillKit";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useMonsterGeneration } from "@/ai/useMonsterGeneration";
import type { MonsterAiGenerated } from "@/ai/types";
import { useCampaignStore } from "@/stores/campaign";
import { useMonsterQuote } from "@/composables/ai/quotes/monsterQuote";
import { MONSTER_TYPES } from "@/types/monster.types";

const ID = "monster_sheet";
const FORM = "monster editor";

/** A challenge rating as the editor's field takes it: a whole number or a fraction such as 1/2. */
const CHALLENGE_RATING = /^\d{1,2}(\/\d{1,2})?$/;

export function useMonsterSheetAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useMonsterQuote();
  const { blockFor } = useAskGate(null, "monster");
  const { generate, error } = useMonsterGeneration();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs(ID, proposal.inputs);
    const rating = askString(inputs, "challenge_rating");
    const type = askString(inputs, "monster_type")?.toLowerCase() ?? null;
    return {
      challengeRating: rating !== null && CHALLENGE_RATING.test(rating) ? rating : null,
      monsterType: type !== null && MONSTER_TYPES.some((t) => t === type) ? type : null,
      size: askString(inputs, "size"),
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteFor({ image: read.image });
    const lines: AskQuoteLine[] = [{ label: "Fills", value: "The monster sheet on screen", credits: null }];
    if (read.challengeRating) lines.push({ label: "Challenge rating", value: read.challengeRating, credits: null });
    if (read.monsterType) lines.push({ label: "Type", value: read.monsterType, credits: null });
    if (read.size) lines.push({ label: "Size", value: read.size, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });
    const block = blockFor({ total: priced.total, fiveE: true }) ?? formClosedBlock(ID, FORM) ?? conceptBlock(read.concept, "monster", { empty: "Say what this monster is like first.", shorten: "concept" });
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Stat block", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Stat block", "Another AI generation is already running. Try again when it finishes.");
    const read = understand(proposal);
    const result: MonsterAiGenerated | null = await generate(read.concept, {
      challenge_rating: read.challengeRating ?? undefined,
      monster_type: read.monsterType ?? undefined,
      size: read.size ?? undefined,
      generateImage: read.image,
    });
    if (result === null) return failedRun("Stat block", error.value ?? "The monster could not be written. Nothing was charged.");
    const credits = current.total === null ? 0 : current.total;
    return landInForm({ generatorId: ID, label: "Stat block", form: FORM, name: result.name, result, credits });
  }

  return { id: ID, quote, run };
}

export default useMonsterSheetAskAdapter;
