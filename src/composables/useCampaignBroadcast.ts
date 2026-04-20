import { supabase } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/supabase";

/**
 * Write a system message into the campaign chat so all participants
 * (DM and players) see it as a persistent grey italic entry.
 * No separate realtime channel needed — the chat already subscribes to
 * campaign_messages via Supabase Realtime.
 */
export async function sendCampaignAnnouncement(campaignId: string, text: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;
  await supabase.from("campaign_messages").insert({
    campaign_id: campaignId,
    user_id: user.id,
    recipient_user_id: null,
    sender_name: null,
    message: text,
    type: "system",
    metadata: null,
  });
}
