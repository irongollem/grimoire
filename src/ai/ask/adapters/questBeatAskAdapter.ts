/**
 * Ask Grimoire (#1253): writing a quest beat's title, read-aloud and DM lead.
 *
 * A `fill`: the beat is `proposal.target` (the server checked it belongs to this campaign; the source read checks the
 * quest's campaign again). The price is the fill bar's (`useQuestBeatQuote`), the context is the one the bar builds
 * (`useQuestBeatFillSource`, `buildBeatFillContext`), and the run is `useFillQuestBeat`, which applies the fill with
 * the editor's own rule (`applyFilledBeat`) and saves it through the editor's own mutation.
 *
 * The editor asks "Replace the existing text?" before it spends. Ask cannot ask in the middle of a run, so the quote
 * says it: a beat that already has read-aloud or a DM lead shows "Replaces the existing text", and pressing the
 * button is the consent. What the DM said in the request is the steer, as the bar's field is.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { useAskGate } from "@/ai/ask/useAskGate";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { questLinkHref } from "@/lib/quests/navigation";
import { hasBeatText } from "@/lib/quests/beatText";
import { useCampaignStore } from "@/stores/campaign";
import { useQuestBeatQuote } from "@/composables/ai/quotes/questBeatQuote";
import { useQuestBeatFillSource } from "@/composables/quests/useQuestBeatFillSource";
import { useFillQuestBeat } from "@/composables/quests/useFillQuestBeat";

export function useQuestBeatAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const priceOf = useQuestBeatQuote();
  const { blockFor } = useAskGate(null, "beat");
  const { fillBeat, error: fillError } = useFillQuestBeat();

  // Read only once a proposal names a beat: this adapter lives as long as the panel, which is on every page.
  const wantedBeat = ref<string | null>(null);
  const { source, error: sourceError } = useQuestBeatFillSource(wantedBeat);

  function sourceFor(proposal: AskProposal) {
    const id = proposal.target?.type === "quest_beat" ? proposal.target.id : null;
    wantedBeat.value = id;
    return id === null ? null : source.value;
  }

  function quote(proposal: AskProposal): AskQuote {
    const found = sourceFor(proposal);
    const priced = priceOf();
    const replaces = !!found && (hasBeatText(found.beat.read_aloud) || hasBeatText(found.beat.dm_content));

    const lines: AskQuoteLine[] = [];
    if (found) {
      lines.push({ label: "Beat", value: found.beat.title.trim() || "Untitled beat", credits: null });
      lines.push({ label: "Quest", value: found.quest.title, credits: null });
    } else if (proposal.target) {
      lines.push({ label: "Beat", value: proposal.target.name, credits: null });
    }
    lines.push({ label: "Writes", value: replaces ? "Replaces the existing text" : "Read-aloud and DM lead", credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, byok: priced.byok });
    if (!block && proposal.target?.type !== "quest_beat") {
      block = { reason: "missing", message: "Say which beat to write first." };
    } else if (!block && found === undefined && sourceError.value) {
      block = { reason: "missing", message: "That beat could not be read." };
    } else if (!block && found === undefined) {
      block = { reason: "missing", message: "Still reading the quest." };
    } else if (!block && found === null) {
      block = { reason: "missing", message: "That beat is not in this campaign, so there is nothing to write." };
    }
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Beat text", current.block.message);
    const found = sourceFor(proposal);
    if (!found) return failedRun("Beat text", "That beat could not be read.");
    if (isAnyAiGenerating.value) return failedRun("Beat text", "Another AI generation is already running. Try again when it finishes.");
    const credits = current.total === null ? 0 : current.total;
    const overwrite = hasBeatText(found.beat.read_aloud) || hasBeatText(found.beat.dm_content);

    let saved;
    try {
      saved = await fillBeat({ beat: found.beat, context: found.context, steer: proposal.concept.trim().slice(0, AI_PROMPT_LIMIT), overwrite });
    } catch (e) {
      // The text was written and paid for, and the save failed (often: the beat changed in another window).
      return { record: null, route: null, parts: [{ label: "Beat text", ok: false, credits, error: e instanceof Error ? e.message : "The beat could not be saved." }] };
    }
    if (!saved) return failedRun("Beat text", fillError.value ?? "The beat could not be written. Nothing was charged.");

    return {
      record: { type: "quest_beat", id: saved.id, name: saved.title },
      route: questLinkHref(saved.quest_id, { beat: saved.id, open: true }),
      parts: [{ label: "Beat text", ok: true, credits }],
    };
  }

  return { id: "quest_beat", quote, run };
}

export default useQuestBeatAskAdapter;
