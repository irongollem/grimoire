/**
 * Ask Grimoire (#1253): the Trap Generator, as a quote and a run.
 *
 * The price is `useTrapQuote`'s, the gates are the page's (AI off, a game system without stat blocks, the balance: traps have no quota) and the run
 * is `useGenerateTrap`, the generate-and-save step the page calls. The kind and the challenge rating are kept only when they are ones the page's pickers offer.
 *
 * "The party in the picture" sends the campaign's group portrait as the picture's reference, only while the picture is
 * on and the campaign has both an image provider and a group portrait (the old panel's own condition); the card hides
 * the switch otherwise (`ASK_AVAILABLE.group_portrait`) and this adapter reads it as not asked. It is not a
 * block here that the notice must be accepted first: `useTrapGeneration` asks for the likeness notice itself before it
 * spends anything, and the dialog is mounted app-wide, so it opens over the Familiar exactly as it did over the panel.
 * A declined notice made nothing, which `useTrapGeneration` says as its error.
 *
 * A failed picture never costs the trap: the row is saved first and the picture is its own part. There is no
 * one-picture retry for a trap yet (`useMissingPortrait` has no kind for it), so a failed picture says to add one
 * from the trap's own page.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useTrapQuote } from "@/composables/ai/quotes/trapQuote";
import { useGenerateTrap } from "@/composables/dungeon-features/useGenerateTrap";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { CR_LIST, TRAP_TYPES } from "@/types/trap.types";

/** The page's picker offers a fixed list: a value is kept only when it is on it, spelled the way the page spells it. */
function knownTrapType(said: string | null): string | null {
  if (said === null) return null;
  const found = TRAP_TYPES.find((t) => t.toLowerCase() === said.toLowerCase());
  return found === undefined ? null : found;
}

/** The challenge rating, only when it is one the page's picker offers. */
function knownCr(said: string | null): string | null {
  if (said === null) return null;
  const found = CR_LIST.find((c) => c === said.trim());
  return found === undefined ? null : found;
}

export function useTrapAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const { imageProvider } = useCampaignProviders();
  const quoteTrap = useTrapQuote();
  const { blockFor } = useAskGate(null, "trap");
  const { generateAndCreateTrap } = useGenerateTrap();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("trap", proposal.inputs);
    const type = knownTrapType(askString(inputs, "trap_type"));
    const image = askFlag(inputs, "image");
    return {
      trapType: type,
      cr: knownCr(askString(inputs, "cr")),
      image,
      // Defence in depth: the card hides the switch while the campaign cannot use it, and a request typed to the
      // model that asks for it anyway is read as not asked, so no likeness is ever sent without a portrait to send.
      partyInPicture: image && askFlag(inputs, "party_in_picture") && Boolean(imageProvider.value) && groupPortraitUrl() !== null,
      concept: proposal.concept.trim(),
    };
  }

  const groupPortraitUrl = () => campaign.activeCampaign?.group_portrait_url ?? null;

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteTrap({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.trapType) lines.push({ label: "Kind", value: read.trapType, credits: null });
    if (read.cr) lines.push({ label: "Challenge rating", value: read.cr, credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });
    if (read.partyInPicture) lines.push({ label: "Party", value: "In the picture", credits: null });

    // The card does not show the party switch without a group portrait and an image provider, and `understand` drops
    // it, so there is nothing to block on.
    const block = blockFor({ total: priced.total, fiveE: true }) ?? conceptBlock(read.concept, "trap");
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Trap text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateTrap(read.concept, {
        trap_type: read.trapType ?? undefined,
        cr: read.cr ?? undefined,
        // The generation asks for the likeness notice before it spends anything when this is set.
        groupPortraitUrl: read.partyInPicture ? groupPortraitUrl() : null,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of traps on this plan."
        : e instanceof Error ? e.message : "The trap could not be saved.";
      return failedRun("Trap text", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Trap text", outcome.error ?? "Trap generation failed.");

    const parts: AskRunResult["parts"] = [
      { label: "Trap text", ok: true, credits: spent(current.lines.find((l) => l.label === "Trap text")) },
    ];
    if (read.image) {
      const credits = spent(current.lines.find((l) => l.label === "Picture"));
      parts.push(picturePart({ saved: outcome.picture === "saved", credits, noun: "trap" }));
    }
    return { record: { type: "other", id: outcome.id, name: outcome.name }, route: `/traps/${outcome.id}`, parts, picture: outcome.picture === "saved" && outcome.pictureUrl !== null ? outcome.pictureUrl : undefined };
  }

  return { id: "trap", quote, run };
}

export default useTrapAskAdapter;
