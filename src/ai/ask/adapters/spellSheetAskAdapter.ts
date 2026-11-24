/**
 * Ask Grimoire (#1270): the spell editor's own Generate, as a card in the Familiar that fills the open sheet.
 *
 * Same generation (`useSpellGeneration`, the editor dialog's) and price (`useSpellQuote`) as the spell generator;
 * nothing is created, the spell goes to the form the page registered (`useAskFormFill`). No quota gate: no record is
 * made. Needs a game system with 5e rules, as the editor does.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, matchKey } from "@/ai/ask/adapters/askAdapterKit";
import { formClosedBlock, landInForm } from "@/ai/ask/adapters/formFillKit";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useSpellGeneration } from "@/ai/useSpellGeneration";
import type { SpellAiGenerated } from "@/ai/types";
import { useCampaignStore } from "@/stores/campaign";
import { useSpellQuote } from "@/composables/ai/quotes/spellQuote";
import { SPELL_SCHOOLS } from "@/types/spell.types";

const ID = "spell_sheet";
const FORM = "spell editor";

function levelLabel(level: number): string {
  return level === 0 ? "Cantrip" : `Level ${level}`;
}

export function useSpellSheetAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useSpellQuote();
  const { blockFor } = useAskGate(null, "spell");
  const { generate, error } = useSpellGeneration();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs(ID, proposal.inputs);
    const level = askString(inputs, "level");
    return {
      level: level === null ? null : Number(level),
      school: matchKey(askString(inputs, "school"), SPELL_SCHOOLS),
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteFor({ image: read.image });
    const lines: AskQuoteLine[] = [{ label: "Fills", value: "The spell sheet on screen", credits: null }];
    if (read.level !== null) lines.push({ label: "Level", value: levelLabel(read.level), credits: null });
    if (read.school) lines.push({ label: "School", value: read.school, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });
    const block = blockFor({ total: priced.total, fiveE: true }) ?? formClosedBlock(ID, FORM, proposal) ?? conceptBlock(read.concept, "spell", { empty: "Say what this spell is like first.", shorten: "concept" });
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Spell", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Spell", "Another AI generation is already running. Try again when it finishes.");
    const read = understand(proposal);
    const result: SpellAiGenerated | null = await generate(read.concept, {
      level: read.level ?? undefined,
      school: read.school ?? undefined,
      generateImage: read.image,
    });
    if (result === null) return failedRun("Spell", error.value ?? "The spell could not be written. Nothing was charged.");
    const credits = current.total === null ? 0 : current.total;
    return landInForm({ generatorId: ID, proposal, label: "Spell", form: FORM, name: result.name, result, credits });
  }

  return { id: ID, quote, run };
}

export default useSpellSheetAskAdapter;
