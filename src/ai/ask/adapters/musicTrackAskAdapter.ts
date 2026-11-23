/**
 * Ask Grimoire (#1253): composing a soundboard track, as a quote and a run.
 *
 * The price is the Generate tab's (`useMusicTrackQuote`), the gates are the tab's (AI on, a balance), and the run is
 * `useMusicGeneration().generate`, the durable `generate-music` job the tab calls. Only the server path is offered:
 * a DM on the legacy local-key path composes in `SoundForm`, in the foreground, so Ask blocks there rather than start
 * a second local path.
 *
 * The job takes minutes, and `generate` waits for it, so `run` waits too and the panel shows the button loading, as it
 * does for any run. The track lands on the board by itself (the sound row is made with the charge); the result opens
 * the soundboard.
 *
 * What Ask cannot say that the tab can: @-mentions, lyrics and a hand-edited prompt. The track is filed under
 * "ambient", the tab's own default.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { askFlag, askInteger, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useMusicGeneration } from "@/ai/useMusicGeneration";
import { MUSIC_LENGTHS, type MusicLengthSeconds } from "@/lib/audio/aiMusic";
import { localKeyModeChosen } from "@/lib/localKeyVault";
import { useCampaignStore } from "@/stores/campaign";
import { useMusicTrackQuote } from "@/composables/ai/quotes/musicTrackQuote";

/** The longest description the server takes (`MAX_DESCRIPTION_CHARS` in generate-music). */
const DESCRIPTION_MAX = 4000;
const NAME_MAX = 60;
const DEFAULT_SECONDS: MusicLengthSeconds = 60;

/** The contract allows 60 to 180 seconds; the server takes 1, 2 or 3 minutes only, so the nearest of those. */
function nearestLength(seconds: number | null): MusicLengthSeconds {
  if (seconds === null) return DEFAULT_SECONDS;
  return MUSIC_LENGTHS.reduce((best, l) => Math.abs(l.seconds - seconds) < Math.abs(best.seconds - seconds) ? l : best).seconds;
}

export function useMusicTrackAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const priceOf = useMusicTrackQuote();
  const { blockFor } = useAskGate(null, "track");
  const music = useMusicGeneration();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("music_track", proposal.inputs);
    return {
      lengthSeconds: nearestLength(askInteger(inputs, "length_seconds")),
      // A plain yes is a singer; the choir and the lyrics are the tab's to choose.
      vocals: askFlag(inputs, "vocals") ? "vocals" as const : "instrumental" as const,
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = priceOf();
    const lines: AskQuoteLine[] = [
      { label: "Length", value: `${read.lengthSeconds / 60} min`, credits: null },
      { label: "Vocals", value: read.vocals === "vocals" ? "With singing" : "Instrumental", credits: null },
      { label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null },
      ...priced.lines,
    ];

    let block = blockFor({ total: priced.total, byok: priced.byok });
    if (!block && localKeyModeChosen() && campaign.decryptedGeminiKey) {
      block = { reason: "system", message: "Your own Gemini key runs music in the Add Sound dialog, not from here." };
    } else if (!block && !campaign.activeCampaignId) {
      block = { reason: "missing", message: "No active campaign selected." };
    } else if (!block && read.concept === "") {
      block = { reason: "missing", message: "Say what the music should sound like first." };
    } else if (!block && read.concept.length > DESCRIPTION_MAX) {
      block = { reason: "missing", message: `Shorten the description to ${DESCRIPTION_MAX} characters.` };
    }
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Track", current.block.message);
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return failedRun("Track", "No active campaign selected.");
    if (isAnyAiGenerating.value) return failedRun("Track", "Another AI generation is already running. Try again when it finishes.");
    const read = understand(proposal);
    const credits = current.total === null ? 0 : current.total;

    const done = await music.generate({
      campaignId,
      soundName: read.concept.slice(0, NAME_MAX),
      category: "ambient",
      request: { description: read.concept, lengthSeconds: read.lengthSeconds, vocals: read.vocals, imageCount: 0 },
      imageUrls: [],
      prompt: null,
      // The Add Sound dialog's half-typed draft is the DM's, not this conversation's.
      keepDraft: true,
    });
    if (!done) return failedRun("Track", music.error.value ?? "The track could not be composed.");

    const soundId = music.completedEntityId.value;
    return {
      // Another tab may have applied the job first; the track is on the board either way.
      record: soundId === null ? null : { type: "other", id: soundId, name: read.concept.slice(0, NAME_MAX) },
      route: "/soundboard",
      parts: [{ label: "Track", ok: true, credits }],
    };
  }

  return { id: "music_track", quote, run };
}

export default useMusicTrackAskAdapter;
