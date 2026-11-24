/**
 * Ask Grimoire (#1253): the Recipe Generator, as a quote and a run.
 *
 * The price is `useRecipeQuote`'s (the one `RecipeGeneratorPanel` shows), and the run is `useGenerateRecipe`: the
 * output item (made, or an existing one matched by name) and the recipe, then its outputs, ingredients and
 * modifiers. The page shows "this will create" before writing; the quote is Ask's version of that step. The server
 * refuses a recipe for a campaign whose game system has no 5e rules, so the quote does too (the contract does not
 * mark it 5e-only; the server is the authority). The discipline is matched against the page's own list; a word it
 * does not offer is not understood. `output_item_id` is the page's "Output item" picker: the recipe makes that item of
 * the campaign instead of one it matches or invents. The campaign's items are read only once a recipe is proposed, because the
 * output is matched against them; the quote waits for them rather than make a duplicate of an item that exists. A
 * failure after the recipe exists is its own part, so nothing is stranded and nothing is made twice.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchOption, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useRecipeQuote } from "@/composables/ai/quotes/recipeQuote";
import { useGenerateRecipe } from "@/composables/crafting/useGenerateRecipe";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";

const DISCIPLINES = CRAFTING_DISCIPLINES.map((d) => ({ id: d.id, label: d.label }));

export function useRecipeAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteRecipe = useRecipeQuote();
  const { blockFor } = useAskGate(null, "recipe");
  const { generateAndCreateRecipe } = useGenerateRecipe();

  const lookupsWanted = ref(false);
  const { data: items } = useItemIndex(() => ({ enabled: lookupsWanted.value }));

  function understand(proposal: AskProposal) {
    lookupsWanted.value = true;
    const inputs = readAskInputs("recipe", proposal.inputs);
    const outputId = askString(inputs, "output_item_id");
    return {
      // An item of this campaign's own index: an id it does not hold is not understood, so no recipe makes another's item.
      output: outputId === null ? null : items.value?.find((i) => i.id === outputId) ?? null,
      discipline: matchOption(askString(inputs, "discipline"), DISCIPLINES),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteRecipe();

    const lines: AskQuoteLine[] = [];
    if (read.discipline) lines.push({ label: "Discipline", value: DISCIPLINES.find((d) => d.id === read.discipline)?.label ?? read.discipline, credits: null });
    if (read.output) lines.push({ label: "Makes", value: read.output.name, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, fiveE: true }) ?? conceptBlock(read.concept, "recipe");
    if (!block && items.value === undefined) block = { reason: "missing", message: "Still reading this campaign's items." };
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Recipe text", current.block.message);
    const read = understand(proposal);
    const known = items.value;
    if (known === undefined) return failedRun("Recipe text", "Still reading this campaign's items.");

    let outcome;
    try {
      outcome = await generateAndCreateRecipe(read.concept, { discipline: read.discipline ?? undefined, items: known, output: read.output });
    } catch (e) {
      return failedRun("Recipe text", saveFailure(e, "recipes", "The recipe could not be saved."));
    }
    if (!outcome.recipe) return failedRun("Recipe text", outcome.error ?? "Recipe generation failed.");

    const { id, name, partsFailure } = outcome.recipe;
    const parts: AskRunPart[] = [{ label: "Recipe text", ok: true, credits: spent(current.lines.find((l) => l.label === "Recipe text")) }];
    if (partsFailure) {
      parts.push({
        label: "Outputs and ingredients",
        ok: false,
        credits: 0,
        error: "The recipe is saved, but part of it was not. Check its outputs, ingredients and modifiers.",
      });
    }
    return { record: { type: "other", id, name }, route: `/crafting/${id}`, parts };
  }

  return { id: "recipe", quote, run };
}

export default useRecipeAskAdapter;
