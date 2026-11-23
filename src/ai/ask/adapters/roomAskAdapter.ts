/**
 * Ask Grimoire (#1253): describing a room in a site.
 *
 * A `fill`: the room is `proposal.target` (the server checked it belongs to this campaign; the source read checks again
 * that it is a room of a site). The price is the room list's (`useRoomQuote`), the grounding is the list's
 * (`useRoomFillSource`, `roomFillConstraintsFor`: the site, its floor, the room's exits and the other rooms), and the
 * run is `useFillRoom`, which rolls it and saves it the way the list's Save does.
 *
 * The room list offers "Fill" only on an unwritten room and shows the draft before saving. Ask has no draft, so the
 * quote says what it writes: a room that already has a description shows "Replaces the description", and the button
 * press is the consent. What the DM said in the request is the steer, as the list's field is.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { useAskGate } from "@/ai/ask/useAskGate";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { placeRoute } from "@/lib/locations/placeRoute";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import { useCampaignStore } from "@/stores/campaign";
import { useRoomQuote } from "@/composables/ai/quotes/roomQuote";
import { useRoomFillSource } from "@/composables/locations/useRoomFillSource";
import { useFillRoom } from "@/composables/locations/useFillRoom";

export function useRoomAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const priceOf = useRoomQuote();
  const { blockFor } = useAskGate(null, "room");
  const { fillRoom, error: fillError } = useFillRoom();

  // Read only once a proposal names a room: this adapter lives as long as the panel, which is on every page.
  const wantedRoom = ref<string | null>(null);
  const { source, error: sourceError } = useRoomFillSource(wantedRoom);

  function sourceFor(proposal: AskProposal) {
    const id = proposal.target?.type === "room" ? proposal.target.id : null;
    wantedRoom.value = id;
    return id === null ? null : source.value;
  }

  function quote(proposal: AskProposal): AskQuote {
    const found = sourceFor(proposal);
    const priced = priceOf();
    const replaces = !!found && tiptapToPlainText(found.room.description).trim() !== "";

    const lines: AskQuoteLine[] = [];
    if (found) {
      lines.push({ label: "Room", value: found.room.name, credits: null });
      lines.push({ label: "In", value: found.site.name, credits: null });
    } else if (proposal.target) {
      lines.push({ label: "Room", value: proposal.target.name, credits: null });
    }
    lines.push({ label: "Writes", value: replaces ? "Replaces the description" : "Read-aloud and what is here", credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, byok: priced.byok });
    if (!block && proposal.target?.type !== "room") {
      block = { reason: "missing", message: "Say which room to describe first." };
    } else if (!block && found === undefined && sourceError.value) {
      block = { reason: "missing", message: "That room could not be read." };
    } else if (!block && found === undefined) {
      block = { reason: "missing", message: "Still reading the site." };
    } else if (!block && found === null) {
      block = { reason: "missing", message: "That is not a room of a site in this campaign, so there is nothing to describe." };
    }
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Room text", current.block.message);
    const found = sourceFor(proposal);
    if (!found) return failedRun("Room text", "That room could not be read.");
    if (isAnyAiGenerating.value) return failedRun("Room text", "Another AI generation is already running. Try again when it finishes.");
    const credits = current.total === null ? 0 : current.total;

    let saved;
    try {
      saved = await fillRoom({ room: found.room, constraints: found.constraints, steer: proposal.concept.trim().slice(0, AI_PROMPT_LIMIT) });
    } catch (e) {
      // The text was written and paid for, and the save failed.
      return { record: null, route: null, parts: [{ label: "Room text", ok: false, credits, error: e instanceof Error ? e.message : "The room could not be saved." }] };
    }
    if (!saved) return failedRun("Room text", fillError.value ?? "The room could not be described. Nothing was charged.");

    return {
      record: { type: "room", id: saved.id, name: saved.name },
      route: placeRoute(saved.id),
      parts: [{ label: "Room text", ok: true, credits }],
    };
  }

  return { id: "room", quote, run };
}

export default useRoomAskAdapter;
