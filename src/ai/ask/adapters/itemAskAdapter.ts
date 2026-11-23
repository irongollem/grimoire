/**
 * Ask Grimoire (#1253): the Item Generator, as a quote and a run.
 *
 * A seam over the page's own workflow: the price is `useItemQuote`'s (the one `ItemGeneratorPanel` shows), the gates
 * are the page's (`useAskGate`, which also refuses a campaign whose game system has no 5e rules), and the run is
 * `useGenerateItem`, the generate-then-create step the page calls. The item is saved before its picture is judged:
 * a failed picture leaves the item and a part that paints the saved row once with the page's own paint flow.
 *
 * The contract's rarity reads "very rare" with a space and the app's key is `very_rare`, so both are matched through
 * `matchKey`; a type or rarity the app has no key for is not understood (the description still carries it).
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskChoices, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { askLinkLines, chosenAskLinks, conceptBlock, failedRun, matchKey, picturePart, readAskLinks, resolveAskLinks, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useAskLinkRecords } from "@/ai/ask/adapters/askLinkRecords";
import type { AskLink } from "@edge-shared/agent/askLinks";
import { useMissingPortrait } from "@/ai/useMissingPortrait";
import { useCampaignStore } from "@/stores/campaign";
import { useItemQuote } from "@/composables/ai/quotes/itemQuote";
import { useGenerateItem } from "@/composables/items/useGenerateItem";
import { isQuotaExceeded } from "@/lib/quotaError";
import { ITEM_RARITIES, ITEM_RARITY_LABELS, ITEM_TYPES, ITEM_TYPE_LABELS } from "@/types/item.types";

export function useItemAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteItem = useItemQuote();
  // No quota resource: the page does not cap items either.
  const { blockFor } = useAskGate(null, "item");
  const { generateAndCreateItem } = useGenerateItem();
  const missing = useMissingPortrait("item");

  // The records the ties name, read only once a proposal has some.
  const wantedLinks = ref<AskLink[]>([]);
  const linkRecords = useAskLinkRecords(() => wantedLinks.value);

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("item", proposal.inputs);
    const askedLinks = readAskLinks("item", proposal.inputs);
    // Set only on a change, so reading a quote never re-triggers itself.
    if (askedLinks.map((l) => `${l.kind}:${l.id}:${l.relation}`).join() !== wantedLinks.value.map((l) => `${l.kind}:${l.id}:${l.relation}`).join()) {
      wantedLinks.value = askedLinks;
    }
    const links = linkRecords.names.value ? resolveAskLinks("item", askedLinks, linkRecords.names.value) : [];
    return {
      links,
      itemType: matchKey(askString(inputs, "item_type"), ITEM_TYPES),
      rarity: matchKey(askString(inputs, "rarity"), ITEM_RARITIES),
      cursed: askFlag(inputs, "cursed"),
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal, choices?: AskChoices): AskQuote {
    const read = understand(proposal);
    const priced = quoteItem({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.itemType) lines.push({ label: "Type", value: ITEM_TYPE_LABELS[read.itemType], credits: null });
    if (read.rarity) lines.push({ label: "Rarity", value: ITEM_RARITY_LABELS[read.rarity], credits: null });
    if (read.cursed) lines.push({ label: "Curse", value: "Cursed, the AI chooses the curse", credits: null });
    lines.push(...askLinkLines(read.links, choices));
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok, fiveE: true }) ?? conceptBlock(read.concept, "item");
    if (!block && linkRecords.loading.value) block = { reason: "missing", message: "Still reading the records it is tied to." };
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal, choices?: AskChoices): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal, choices);
    if (current.block) return failedRun("Item", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateItem(read.concept, {
        item_type: read.itemType ?? undefined,
        rarity: read.rarity ?? undefined,
        cursed: read.cursed || undefined,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
        links: chosenAskLinks(read.links, choices),
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of items on this plan."
        : e instanceof Error ? e.message : "The item could not be saved.";
      return failedRun("Item", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Item", outcome.error ?? "Item generation failed.");

    const id = outcome.id;
    const name = outcome.name;
    const parts: AskRunPart[] = [{ label: "Item", ok: true, credits: spent(current.lines.find((l) => l.label === "Item")) }];
    if (read.image) {
      parts.push(picturePart({
        label: "Picture",
        saved: outcome.picture === "saved",
        credits: spent(current.lines.find((l) => l.label === "Picture")),
        noun: "item",
        retry: { credits: missing.cost.value, paint: () => missing.paint(id, `${name}. ${read.concept}`), error: () => missing.error.value },
      }));
    }
    if (outcome.linkErrors.length) {
      parts.push({ label: "Connections", ok: false, credits: 0, error: `Some connections could not be added: ${outcome.linkErrors.join("; ")}` });
    }
    return { record: { type: "item", id, name }, route: `/vault/${id}`, parts, picture: outcome.picture === "saved" && outcome.pictureUrl !== null ? outcome.pictureUrl : undefined };
  }

  return { id: "item", quote, run };
}

export default useItemAskAdapter;
