/**
 * Ask Grimoire (#1270): the NPC editor's own Generate, as a card in the Familiar that fills the open sheet.
 *
 * Same generation as the NPC generator (`useNpcGeneration`, the one the editor's dialog called) and the same price
 * (`useNpcQuote`), but nothing is created: the result goes to the form the page registered (`useAskFormFill`), and the
 * DM saves the NPC as always. No quota gate, because no record is made. The alter ego's likeness notice is asked by the
 * generation itself, as everywhere.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { formClosedBlock, landInForm } from "@/ai/ask/adapters/formFillKit";
import { askFlag, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useNpcGeneration } from "@/ai/useNpcGeneration";
import type { NpcAiGenerated } from "@/ai/types";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcQuote } from "@/composables/ai/quotes/npcQuote";

const ID = "npc_sheet";
const FORM = "NPC editor";

export function useNpcSheetAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useNpcQuote();
  const { blockFor } = useAskGate(null, "NPC");
  const { generate, error } = useNpcGeneration();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs(ID, proposal.inputs);
    const portrait = askFlag(inputs, "portrait");
    return { portrait, alterEgo: portrait && askFlag(inputs, "alter_ego"), concept: proposal.concept.trim() };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteFor({ portrait: read.portrait, alterEgo: read.alterEgo });
    const lines: AskQuoteLine[] = [{ label: "Fills", value: "The NPC sheet on screen", credits: null }, { label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null }];
    lines.push(...priced.lines);
    if (!read.portrait) lines.push({ label: "Portrait", value: "None", credits: null });
    const block = blockFor({ total: priced.total }) ?? formClosedBlock(ID, FORM) ?? conceptBlock(read.concept, "NPC", { empty: "Say who this NPC is first.", shorten: "concept" });
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Sheet", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Sheet", "Another AI generation is already running. Try again when it finishes.");
    const read = understand(proposal);
    const result: NpcAiGenerated | null = await generate(read.concept, { generateImage: read.portrait, generateAlterEgo: read.alterEgo });
    if (result === null) return failedRun("Sheet", error.value ?? "The NPC could not be written. Nothing was charged.");
    const credits = current.total === null ? 0 : current.total;
    return landInForm({ generatorId: ID, label: "Sheet", form: FORM, name: result.name, result, credits });
  }

  return { id: ID, quote, run };
}

export default useNpcSheetAskAdapter;
