/**
 * Ask Grimoire (#1253): the Deity Generator, as a quote and a run.
 *
 * The price is `useDeityQuote`'s (the one `DeityGeneratorPanel` shows), the gates are the page's (`useAskGate`, with
 * the plan's deity quota), and the run is `useGenerateDeity`, the generate-then-save step the page calls. The
 * pantheon is named by the model and matched against this campaign's pantheons: a name that matches none is not
 * understood. The deity's secrets note can fail on its own; the deity is saved and that is its own part. The
 * picture cannot be painted again from Ask (it is not one of the kinds `useMissingPortrait` knows), so a failed
 * picture is said plainly and the deity's own page can paint it.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchOption, picturePart, sameWord, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useAllDeities, useAllPantheons } from "@/composables/deities/useDeities";
import { useDeityQuote } from "@/composables/ai/quotes/deityQuote";
import { useGenerateDeity } from "@/composables/deities/useGenerateDeity";
import { CLERIC_DOMAINS, DEITY_ALIGNMENTS } from "@/types/deity.types";

const ALIGNMENTS = DEITY_ALIGNMENTS.map((a) => ({ id: a, label: a }));
const DOMAINS = CLERIC_DOMAINS.map((d) => ({ id: d, label: d }));

export function useDeityAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteDeity = useDeityQuote();
  const { blockFor } = useAskGate("deities", "deity", "deities");
  const { generateAndCreateDeity } = useGenerateDeity();

  // Read only once a proposal names a pantheon: this adapter lives as long as the panel, which is mounted on every
  // page, and a closed panel must cost no egress.
  const lookupsWanted = ref(false);
  const { data: pantheons } = useAllPantheons(() => lookupsWanted.value);
  const { data: deities } = useAllDeities(() => lookupsWanted.value);
  const lookupsLoading = computed(() => lookupsWanted.value && (pantheons.value === undefined || deities.value === undefined));

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("deity", proposal.inputs);
    const pantheonName = askString(inputs, "pantheon");
    if (pantheonName !== null) lookupsWanted.value = true;
    const pantheon = pantheonName === null ? null : pantheons.value?.find((p) => sameWord(p.name, pantheonName)) ?? null;
    return {
      pantheon,
      alignment: matchOption(askString(inputs, "alignment"), ALIGNMENTS),
      domain: matchOption(askString(inputs, "domain"), DOMAINS),
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteDeity({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.pantheon) lines.push({ label: "Pantheon", value: read.pantheon.name, credits: null });
    if (read.alignment) lines.push({ label: "Alignment", value: read.alignment, credits: null });
    if (read.domain) lines.push({ label: "Domain", value: read.domain, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok });
    if (!block) block = conceptBlock(read.concept, "deity");
    if (!block && lookupsLoading.value) block = { reason: "missing", message: "Still reading this campaign's pantheons." };
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Deity text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateDeity(read.concept, {
        pantheon: read.pantheon ?? undefined,
        deities: deities.value,
        alignment: read.alignment ?? undefined,
        primaryDomain: read.domain ?? undefined,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
      });
    } catch (e) {
      return failedRun("Deity text", saveFailure(e, "deities", "The deity could not be saved."));
    }
    if (!outcome.deity) return failedRun("Deity text", outcome.error ?? "Deity generation failed.");

    const { id, name, notesFailure } = outcome.deity;
    const parts: AskRunPart[] = [{ label: "Deity text", ok: true, credits: spent(current.lines.find((l) => l.label === "Deity text")) }];
    if (notesFailure) {
      parts.push({ label: "DM notes", ok: false, credits: 0, error: "The deity is saved, but its DM notes were not." });
    }
    if (read.image) {
      parts.push(outcome.picture === "saved"
        ? { label: "Picture", ok: true, credits: spent(current.lines.find((l) => l.label === "Picture")) }
        : picturePart({ saved: false, credits: 0, noun: "deity" }));
    }
    return { record: { type: "deity", id, name }, route: `/deities/${id}`, parts };
  }

  return { id: "deity", quote, run };
}

export default useDeityAskAdapter;
