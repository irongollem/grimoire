/**
 * Ask Grimoire (#1253, #1270): composing a soundboard track, as a quote and a run.
 *
 * The Add Sound dialog's Generate button and the Soundboard's own open this card; the price is the old tab's
 * (`useMusicTrackQuote`), the gates are its (AI on, a balance), and the run is `useMusicGeneration().generate`, the
 * durable `generate-music` job the tab called.
 *
 * The card holds what the tab held: the name, the board section, one of the three lengths the server makes, the
 * vocals (instrumental, a wordless choir, or a singer with lyrics) and the description with @-mentions. A mention of a
 * character, creature, place or faction hands its picture to Lyria and its lore to the structuring step, resolved here
 * exactly as the tab did (`parseSceneEntities`); over ten pictures the DM trims mentions rather than some going unread.
 *
 * The job takes minutes, and `generate` waits for it, so `run` waits too and the panel shows the button loading, as it
 * does for any run. The track lands on the board by itself (the sound row is made with the charge); the result opens
 * the soundboard.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useAskSceneMentions } from "@/ai/ask/askSceneMentions";
import { stripMentionTokens } from "@/ai/sceneEntities";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useMusicGeneration } from "@/ai/useMusicGeneration";
import { LYRICS_MAX_CHARS, MUSIC_LENGTHS, MUSIC_MAX_IMAGES, type MusicLengthSeconds, type MusicVocals } from "@/lib/audio/aiMusic";
import { useCampaignStore } from "@/stores/campaign";
import { useMusicTrackQuote } from "@/composables/ai/quotes/musicTrackQuote";
import type { SoundCategory } from "@/types/sound.types";

/** The longest description the server takes (`MAX_DESCRIPTION_CHARS` in generate-music). */
const DESCRIPTION_MAX = 4000;
const NAME_MAX = 60;
const CATEGORIES: readonly SoundCategory[] = ["ambient", "music", "effects"];
const VOCALS: readonly MusicVocals[] = ["instrumental", "choir", "vocals"];
const VOCALS_LABEL: Record<MusicVocals, string> = { instrumental: "Instrumental", choir: "A wordless choir", vocals: "With singing" };

/** The length word of the contract ("60", "120", "180") as the seconds the server takes; anything else is a minute. */
function lengthOf(word: string | null): MusicLengthSeconds {
  return MUSIC_LENGTHS.find((l) => String(l.seconds) === word)?.seconds ?? MUSIC_LENGTHS[0].seconds;
}

export function useMusicTrackAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const priceOf = useMusicTrackQuote();
  const { blockFor } = useAskGate(null, "track");
  const music = useMusicGeneration();

  // The people and places are read only once a description names one: this adapter lives as long as the panel.
  const mentionsWanted = ref(false);
  const scene = useAskSceneMentions(() => mentionsWanted.value);

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("music_track", proposal.inputs);
    const concept = proposal.concept.trim();
    mentionsWanted.value = concept.includes("@");
    if (scene.text.value !== concept) scene.text.value = concept;
    const vocals = VOCALS.find((v) => v === askString(inputs, "vocals")) ?? "instrumental";
    const entities = mentionsWanted.value ? scene.entities.value : [];
    const description = stripMentionTokens(concept);
    return {
      name: askString(inputs, "name"),
      category: CATEGORIES.find((c) => c === askString(inputs, "category")) ?? "ambient",
      lengthSeconds: lengthOf(askString(inputs, "length_seconds")),
      vocals,
      // Lyrics only mean something once the track sings.
      lyrics: vocals === "vocals" ? askString(inputs, "lyrics") : null,
      concept,
      description,
      entities,
      imageUrls: [...new Set(entities.flatMap((e) => (e.portraitUrl ? [e.portraitUrl] : [])))],
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = priceOf();
    const lines: AskQuoteLine[] = [];
    if (read.name) lines.push({ label: "Name", value: read.name, credits: null });
    lines.push(
      { label: "Section", value: read.category.charAt(0).toUpperCase() + read.category.slice(1), credits: null },
      { label: "Length", value: `${read.lengthSeconds / 60} min`, credits: null },
      { label: "Vocals", value: VOCALS_LABEL[read.vocals], credits: null },
    );
    const seen = read.entities.filter((e) => e.portraitUrl).map((e) => e.label);
    if (seen.length > 0) lines.push({ label: "Lyria will read", value: `${seen.length} ${seen.length === 1 ? "picture" : "pictures"}: ${seen.join(", ")}`, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null }, ...priced.lines);

    let block = blockFor({ total: priced.total });
    if (!block && !campaign.activeCampaignId) {
      block = { reason: "missing", message: "No active campaign selected." };
    } else if (!block && read.description === "") {
      block = { reason: "missing", message: "Say what the music should sound like first." };
    } else if (!block && read.concept.length > DESCRIPTION_MAX) {
      block = { reason: "missing", message: `Shorten the description to ${DESCRIPTION_MAX} characters.` };
    } else if (!block && read.lyrics !== null && read.lyrics.length > LYRICS_MAX_CHARS) {
      block = { reason: "missing", message: `Shorten the lyrics to ${LYRICS_MAX_CHARS} characters.` };
    } else if (!block && read.imageUrls.length > MUSIC_MAX_IMAGES) {
      block = { reason: "missing", message: `Mention at most ${MUSIC_MAX_IMAGES} characters or places with pictures.` };
    } else if (!block && scene.loading.value) {
      block = { reason: "missing", message: "Still reading the people and places it names." };
    }
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Track", current.block.message);
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return failedRun("Track", "No active campaign selected.");
    if (isAnyAiGenerating.value) return failedRun("Track", "Another AI generation is already running. Try again when it finishes.");
    const read = understand(proposal);
    const credits = current.total === null ? 0 : current.total;
    const soundName = (read.name ?? read.description).slice(0, NAME_MAX);

    const done = await music.generate({
      campaignId,
      soundName,
      category: read.category,
      request: {
        description: read.description,
        lengthSeconds: read.lengthSeconds,
        vocals: read.vocals,
        ...(read.lyrics === null ? {} : { lyrics: read.lyrics }),
        mentions: read.entities.map((e) => ({ label: e.label, description: e.textDescription })),
        imageCount: read.imageUrls.length,
      },
      imageUrls: read.imageUrls,
    });
    if (!done) return failedRun("Track", music.error.value ?? "The track could not be composed.");

    const soundId = music.completedEntityId.value;
    return {
      // Another tab may have applied the job first; the track is on the board either way.
      record: soundId === null ? null : { type: "other", id: soundId, name: soundName },
      route: "/soundboard",
      parts: [{ label: "Track", ok: true, credits }],
    };
  }

  return { id: "music_track", quote, run };
}

export default useMusicTrackAskAdapter;
