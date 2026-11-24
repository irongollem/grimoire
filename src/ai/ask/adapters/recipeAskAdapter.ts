/**
 * Ask Grimoire (#1253, #1270): the Recipe Generator, as a quote and a preview.
 *
 * The price is `useRecipeQuote`'s. The run is two steps (`preview`): `useGenerateRecipe` generates the recipe and
 * decides which item it makes (the DM's pick, one matched by name, or a new one) and the card shows "what this will
 * create", and only the DM's Create writes the output item (when new), the recipe, then its outputs, ingredients and
 * modifiers. The server refuses a recipe for a campaign whose game system has no 5e rules, so the quote does too (the
 * contract does not mark it 5e-only; the server is the authority). The discipline is the card's own list; a word it
 * does not offer is not understood. `output_item_id` is the card's "Output item" pick, from the campaign's items and
 * the enabled library books': the recipe makes that item instead of one it matches or invents. The items are read only
 * once a recipe is proposed, because the output is matched against them; the quote waits for them rather than make a
 * duplicate of an item that exists. A failure after the recipe exists is its own part, so nothing is stranded and
 * nothing is made twice.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome, AskPreviewShown, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchOption, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useRecipeQuote } from "@/composables/ai/quotes/recipeQuote";
import { useGenerateRecipe, type RecipeDraft } from "@/composables/crafting/useGenerateRecipe";
import { CRAFTING_DISCIPLINES } from "@/lib/crafting/disciplines";
import { describeOutputResolution, disciplineLabel } from "@/lib/crafting/recipeAi";
import { craftingTimeText } from "@/lib/crafting/craftingTime";

const DISCIPLINES = CRAFTING_DISCIPLINES.map((d) => ({ id: d.id, label: d.label }));

/** What the card shows of a recipe that is not saved yet: how hard and how long, what goes in, and what comes out. */
function shownRecipe({ recipe, resolution }: RecipeDraft): AskPreviewShown {
  const ingredients = recipe.ingredients.map((i) => `${i.quantity} x ${i.tags.join(" + ")}`).join(", ");
  return {
    title: recipe.name,
    badge: disciplineLabel(recipe.discipline),
    sections: [
      {
        rows: [
          { label: "Difficulty", detail: `DC ${recipe.dc}` },
          { label: "Crafting time", detail: craftingTimeText(recipe.crafting_time, recipe.crafting_time_unit) },
          { label: recipe.ingredients.length === 1 ? "1 ingredient" : `${recipe.ingredients.length} ingredients`, detail: ingredients },
          ...(recipe.modifiers.length > 0 ? [{ label: recipe.modifiers.length === 1 ? "1 modifier" : `${recipe.modifiers.length} modifiers`, detail: "" }] : []),
        ],
      },
      { heading: "Makes", rows: [{ label: describeOutputResolution(resolution), detail: `Quantity ${recipe.output.quantity}` }] },
    ],
  };
}

export function useRecipeAskAdapter(): AskPreviewAdapter {
  const campaign = useCampaignStore();
  const quoteRecipe = useRecipeQuote();
  const { blockFor } = useAskGate(null, "recipe");
  const { generateRecipeDraft, saveRecipe } = useGenerateRecipe();

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

  /** Generates and holds the recipe for the DM to look at: charged here, and `create` writes what was shown for nothing more. */
  async function preview(proposal: AskProposal): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return { ok: false, result: failedRun("Recipe text", current.block.message) };
    const read = understand(proposal);
    const known = items.value;
    if (known === undefined) return { ok: false, result: failedRun("Recipe text", "Still reading this campaign's items.") };

    let outcome;
    try {
      outcome = await generateRecipeDraft(read.concept, { discipline: read.discipline ?? undefined, items: known, output: read.output });
    } catch (e) {
      return { ok: false, result: failedRun("Recipe text", e instanceof Error ? e.message : "Recipe generation failed.") };
    }
    if (outcome.draft === null) return { ok: false, result: failedRun("Recipe text", outcome.error ?? "Recipe generation failed.") };
    const draft: RecipeDraft = outcome.draft;

    const parts: AskRunPart[] = [{ label: "Recipe text", ok: true, credits: spent(current.lines.find((l) => l.label === "Recipe text")) }];

    async function create(): Promise<AskRunResult> {
      let saved;
      try {
        saved = await saveRecipe(draft);
      } catch (e) {
        return failedRun("Recipe text", saveFailure(e, "recipes", "The recipe could not be saved."));
      }
      const made: AskRunPart[] = [...parts];
      if (saved.partsFailure) {
        made.push({
          label: "Outputs and ingredients",
          ok: false,
          credits: 0,
          error: "The recipe is saved, but part of it was not. Check its outputs, ingredients and modifiers.",
        });
      }
      return { record: { type: "other", id: saved.id, name: saved.name }, route: `/crafting/${saved.id}`, parts: made };
    }

    return { ok: true, preview: { shown: shownRecipe(draft), parts, create } };
  }

  return { id: "recipe", quote, preview };
}

export default useRecipeAskAdapter;
