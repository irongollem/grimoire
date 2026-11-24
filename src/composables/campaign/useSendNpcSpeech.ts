import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { npcSpeechMetadata, type NpcSpeechFace } from "@/lib/chat/npcSpeech";
import type { AiProvenance } from "@/ai/provenance";
import type { CampaignMessageInsert } from "@/types/chat.types";

/**
 * Says a line aloud in the campaign chat as an NPC (#1270): an open `chat` message from the signed-in DM, named for the
 * NPC, whose metadata draws it as the NPC's speech bubble. It is the DM's own insert through RLS, like any chat line the
 * DM sends, and every tab (this one too) hears it through the campaign doorbell, so nothing is pushed by hand.
 * The caller passes the NPC's player-facing name and face (`getNpcPlayerFace`), never the DM's view of them.
 * Throws when the insert fails; the caller says so and may try again.
 */
export function useSendNpcSpeech() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();

  return async function sendNpcSpeech(npc: { id: string; name: string; face: NpcSpeechFace }, line: string, provenance: AiProvenance | null): Promise<void> {
    const campaignId = campaign.activeCampaignId;
    const userId = auth.user?.id;
    if (!campaignId || !userId) throw new Error("No campaign is open.");
    const message = line.trim();
    if (!message) throw new Error("There is no line to say.");
    const insert: CampaignMessageInsert = {
      campaign_id: campaignId,
      user_id: userId,
      recipient_user_id: null,
      sender_name: npc.name,
      message,
      type: "chat",
      metadata: npcSpeechMetadata(npc.id, npc.face, { provenance }),
    };
    const { error } = await supabase.from("campaign_messages").insert(insert);
    if (error) throw error;
  };
}
