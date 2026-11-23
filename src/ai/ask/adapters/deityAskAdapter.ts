/**
 * Ask Grimoire (#1253): the Deity Generator, as a quote and a run.
 *
 * The price is `useDeityQuote`'s (the one `DeityGeneratorPanel` shows), the gates are the page's (`useAskGate`, with
 * the plan's deity quota), and the run is `useGenerateDeity`, the generate-then-save step the page calls. The
 * pantheon is given by id (`pantheon_id`, as the page's picker holds it) and looked up in this campaign's own
 * pantheons: an id that matches none is not understood, so the deity joins no pantheon rather than another campaign's. The deity's secrets note can fail on its own; the deity is saved and that is its own part. The
 * picture cannot be painted again from Ask (it is not one of the kinds `useMissingPortrait` knows), so a failed
 * Every other tie goes through `links` (a faction that serves them, a holy place, a relic), read and written as the
 * NPC adapter does; a failed tie is a "Connections" part and the deity stays. A failed
 * picture is said plainly and the deity's own page can paint it.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskChoices, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { askChoice, askLinkLines, chosenAskLinks, conceptBlock, failedRun, matchOption, picturePart, readAskLinks, resolveAskLinks, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useAskLinkRecords } from "@/ai/ask/adapters/askLinkRecords";
import type { AskLink } from "@edge-shared/agent/askLinks";
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

  // The records the ties name, read only once a proposal has some.
  const wantedLinks = ref<AskLink[]>([]);
  const linkRecords = useAskLinkRecords(() => wantedLinks.value);

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("deity", proposal.inputs);
    const pantheonId = askString(inputs, "pantheon_id");
    if (pantheonId !== null) lookupsWanted.value = true;
    const pantheon = pantheonId === null ? null : pantheons.value?.find((p) => p.id === pantheonId) ?? null;
    const askedLinks = readAskLinks("deity", proposal.inputs);
    // Set only on a change, so reading a quote never re-triggers itself.
    if (askedLinks.map((l) => `${l.kind}:${l.id}:${l.relation}`).join() !== wantedLinks.value.map((l) => `${l.kind}:${l.id}:${l.relation}`).join()) {
      wantedLinks.value = askedLinks;
    }
    const links = linkRecords.names.value ? resolveAskLinks("deity", askedLinks, linkRecords.names.value) : [];
    return {
      links,
      pantheon,
      alignment: matchOption(askString(inputs, "alignment"), ALIGNMENTS),
      domain: matchOption(askString(inputs, "domain"), DOMAINS),
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal, choices?: AskChoices): AskQuote {
    const read = understand(proposal);
    const priced = quoteDeity({ image: read.image });

    const lines: AskQuoteLine[] = [];
    // The pantheon is an existing record the deity would join: a yes or no.
    if (read.pantheon) lines.push({ label: "Pantheon", value: read.pantheon.name, credits: null, choice: askChoice(choices, "pantheon_id", true) });
    if (read.alignment) lines.push({ label: "Alignment", value: read.alignment, credits: null });
    if (read.domain) lines.push({ label: "Domain", value: read.domain, credits: null });
    lines.push(...askLinkLines(read.links, choices));
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok });
    if (!block) block = conceptBlock(read.concept, "deity");
    if (!block && lookupsLoading.value) block = { reason: "missing", message: "Still reading this campaign's pantheons." };
    if (!block && linkRecords.loading.value) block = { reason: "missing", message: "Still reading the records it is tied to." };
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal, choices?: AskChoices): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal, choices);
    if (current.block) return failedRun("Deity text", current.block.message);
    const read = understand(proposal);
    // A pantheon at no is left out as if the proposal had not named it.
    const pantheon = askChoice(choices, "pantheon_id", true).on ? read.pantheon : null;

    let outcome;
    try {
      outcome = await generateAndCreateDeity(read.concept, {
        pantheon: pantheon ?? undefined,
        deities: deities.value,
        alignment: read.alignment ?? undefined,
        primaryDomain: read.domain ?? undefined,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
        links: chosenAskLinks(read.links, choices),
      });
    } catch (e) {
      return failedRun("Deity text", saveFailure(e, "deities", "The deity could not be saved."));
    }
    if (!outcome.deity) return failedRun("Deity text", outcome.error ?? "Deity generation failed.");

    const { id, name, notesFailure, linkErrors } = outcome.deity;
    const parts: AskRunPart[] = [{ label: "Deity text", ok: true, credits: spent(current.lines.find((l) => l.label === "Deity text")) }];
    if (notesFailure) {
      parts.push({ label: "DM notes", ok: false, credits: 0, error: "The deity is saved, but its DM notes were not." });
    }
    if (linkErrors.length) {
      parts.push({ label: "Connections", ok: false, credits: 0, error: `Some connections could not be added: ${linkErrors.join("; ")}` });
    }
    if (read.image) {
      parts.push(outcome.picture === "saved"
        ? { label: "Picture", ok: true, credits: spent(current.lines.find((l) => l.label === "Picture")) }
        : picturePart({ saved: false, credits: 0, noun: "deity" }));
    }
    return { record: { type: "deity", id, name }, route: `/deities/${id}`, parts, picture: outcome.picture === "saved" && outcome.pictureUrl !== null ? outcome.pictureUrl : undefined };
  }

  return { id: "deity", quote, run };
}

export default useDeityAskAdapter;
