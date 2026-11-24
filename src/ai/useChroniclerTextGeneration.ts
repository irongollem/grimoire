import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { useCampaignStore } from "@/stores/campaign";
import { AI_PROMPT_LIMIT_CHRONICLE } from "./utils";
import { mentionedLocationIds, mentionedMonsterIds, mentionedNpcIds, parseSceneEntities, type ResolvedSceneEntity } from "./sceneEntities";
import { fetchNpcAppearances } from "@/composables/npcs/useNpcFields";
import type { NpcListRow } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import type { Faction } from "@/types/faction.types";
import type { LocationSummary } from "@/types/location.types";
import { fetchLocationDescriptions } from "@/composables/locations/useLocationDescriptions";
import { fetchMentionedMonsters } from "@/composables/monsters/useMentionedMonsters";
import { fetchSessionCanonText } from "./sessionCanonContext";
import type { AiProvenance } from "@/ai/provenance";

export type ChroniclerTone = "dramatic" | "humorous" | "mysterious" | "epic";

export const CHRONICLER_TONES: { value: ChroniclerTone; label: string }[] = [
  { value: "dramatic",   label: "Dramatic"   },
  { value: "humorous",   label: "Humorous"   },
  { value: "mysterious", label: "Mysterious" },
  { value: "epic",       label: "Epic"       },
] as const;

const TONE_INSTRUCTIONS: Record<ChroniclerTone, string> = {
  dramatic:   "Write with dramatic tension — build toward emotional peaks, use contrast and stakes.",
  humorous:   "Write with wit and levity — find the comedy in chaos, keep it fun.",
  mysterious: "Write with an air of mystery — withhold information, use shadow and implication.",
  epic:       "Write in a grand epic style — heroic deeds, soaring language, fate-altering consequences.",
};


/** Pre-process AI output: replace [[scene: ...]] with styled blockquotes. */
export function preprocessChronicleMarkdown(md: string): string {
  return md.replace(
    /^\[\[scene:\s*(.+?)\]\]\s*$/gm,
    (_, prompt: string) => `> 🖼️ **Illustration suggestion:** ${prompt.trim()}`,
  );
}

/** What `generate()` resolves to — the recap markdown plus (when available)
 *  the provenance record for whoever ends up saving it into a note. */
export interface ChroniclerTextResult {
  chronicle: string;
  ai_provenance?: AiProvenance;
}

export function useChroniclerTextGeneration() {
  const isGenerating = ref(false);
  const error = ref<string | null>(null);
  const campaign = useCampaignStore();

  async function generate(params: {
    rawText: string;
    tone: ChroniclerTone;
    npcs: NpcListRow[] | undefined;
    /** The bestiary index: names to match an @mention against. The lore and
     *  picture of the monsters it names are read here, by id. */
    monsterIndex: readonly { id: string; name: string }[] | undefined;
    partyMembers: PartyMember[] | undefined;
    factions: Faction[] | undefined;
    locations: LocationSummary[] | undefined;
    /** The campaign's existing note tags, most frequent first, so the model
     *  prefers reusing them over minting near-duplicates. */
    existingTags: string[];
    /** The note this chronicle will be inserted into (undefined for a new,
     *  unsaved note). Forwarded to the server so retrieval never returns the
     *  very note the recap is about to be written into (#600). */
    excludeNoteId?: string;
  }): Promise<ChroniclerTextResult> {
    const { rawText, tone, npcs, monsterIndex, partyMembers, factions, locations, existingTags, excludeNoteId } = params;
    // The place list is slim; the descriptions of the places this recap names go
    // to the model, so read exactly those rows.
    const locationDescriptions = await fetchLocationDescriptions(mentionedLocationIds(rawText, locations ?? []));
    // The NPC list carries no prose either (#999): read the looks of the mentioned NPCs.
    const npcAppearances = await fetchNpcAppearances(mentionedNpcIds(rawText, npcs ?? []))
      // Appearance is optional context; the parser still resolves NPC names if the read fails.
      .catch(() => new Map<string, string | null>());
    // Likewise the monsters: the index has names only, so the mentioned ones are read by id.
    const mentionedIds = mentionedMonsterIds(rawText, monsterIndex ?? []);
    const mentionedRows = await fetchMentionedMonsters(mentionedIds);
    const monsters = mentionedIds.flatMap((id) => {
      const row = mentionedRows.get(id);
      return row ? [row] : [];
    });
    const entities = parseSceneEntities(rawText, { npcs, monsters, partyMembers, factions, locations, locationDescriptions, npcAppearances });
    const campaignId = campaign.activeCampaign?.id;
    // What the canon did in this note's session (#1258 item 8). Optional context: a draft is still worth writing without it.
    const canonThisSession = campaignId && excludeNoteId
      ? await fetchSessionCanonText(campaignId, excludeNoteId).catch(() => "")
      : "";

    isGenerating.value = true;
    error.value = null;

    try {
      // Fail fast with a readable message instead of a server 400 round-trip.
      if (rawText.length > AI_PROMPT_LIMIT_CHRONICLE) {
        throw new Error(
          `Session notes exceed the ${AI_PROMPT_LIMIT_CHRONICLE.toLocaleString()}-character limit ` +
            `(currently ${rawText.length.toLocaleString()}). Trim the text and try again.`,
        );
      }
      if (!campaignId) throw new Error("No active campaign selected.");
      return await generateServerSide({ rawText, tone, entities, campaignId, existingTags, excludeNoteId, canonThisSession });
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Generation failed.";
      throw e;
    } finally {
      isGenerating.value = false;
    }
  }

  async function generateServerSide(params: {
    rawText: string;
    tone: ChroniclerTone;
    entities: ResolvedSceneEntity[];
    campaignId: string;
    existingTags: string[];
    excludeNoteId?: string;
    canonThisSession: string;
  }): Promise<ChroniclerTextResult> {
    const { rawText, tone, entities, campaignId, existingTags, excludeNoteId, canonThisSession } = params;

    const tone_instruction = TONE_INSTRUCTIONS[tone];
    const entity_descriptions = entities
      .map((e) => (e.textDescription && e.textDescription !== e.label ? `${e.label}: ${e.textDescription}` : e.label))
      .filter(Boolean);

    const { data, error: fnError } = await supabase.functions.invoke("generate-chronicle-text", {
      body: {
        campaign_id: campaignId,
        raw_text: rawText,
        tone_instruction,
        entity_descriptions,
        existing_tags: existingTags,
        exclude_note_id: excludeNoteId,
        // The edge function must read this field and add it to the model's input; until it does it is ignored.
        canon_this_session: canonThisSession,
      },
    });

    if (fnError) throw new Error(await edgeErrorMessage(fnError));
    if (data?.error) throw new Error(data.error);
    const body = data as { chronicle: string; ai_provenance?: AiProvenance };
    return { chronicle: body.chronicle, ai_provenance: body.ai_provenance };
  }

  return { isGenerating, error, generate };
}
