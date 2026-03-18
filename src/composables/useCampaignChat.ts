import { computed, onUnmounted } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { CampaignMessage as StoredMessage } from "@/types/chat.types";

export interface RollMessage {
  label: string; // "Stealth Check", "STR Save", etc.
  dice: number; // the raw d20 result (1-20)
  modifier: number; // total modifier
  total: number; // dice + modifier
  character_name: string;
}

export interface ChatMessage {
  text: string;
  character_name: string;
}

// Re-export the stored shape as CampaignMessage for consumers
export type { StoredMessage as CampaignMessage };

const QUERY_KEY = "campaign-messages";

// Module-level realtime channel singleton
let chatChannel: ReturnType<typeof supabase.channel> | null = null;
let chatRefCount = 0;

export function useCampaignChat() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  const campaignId = computed(() => campaign.activeCampaignId);

  const { data: messages, isLoading } = useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_messages")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .is("recipient_user_id", null)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as StoredMessage[];
    },
    enabled: () => !!campaignId.value,
  });

  // Realtime subscription
  function subscribeChat() {
    if (chatChannel || !campaignId.value) return;
    chatChannel = supabase
      .channel(`campaign_chat:${campaignId.value}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "campaign_messages",
          filter: `campaign_id=eq.${campaignId.value}`,
        },
        () => {
          void queryClient.invalidateQueries({
            queryKey: [QUERY_KEY, campaignId.value],
          });
        },
      )
      .subscribe();
  }

  chatRefCount++;
  subscribeChat();

  onUnmounted(() => {
    chatRefCount--;
    if (chatRefCount === 0 && chatChannel) {
      supabase.removeChannel(chatChannel);
      chatChannel = null;
    }
  });

  const { mutateAsync: sendMessage } = useMutation({
    mutationFn: async (msg: {
      type: "roll" | "chat";
      message: string;
      senderName: string;
      metadata?: Record<string, unknown> | null;
    }) => {
      const user = await getCurrentUser();
      const { error } = await supabase.from("campaign_messages").insert({
        campaign_id: campaignId.value!,
        user_id: user!.id,
        recipient_user_id: null,
        sender_name: msg.senderName,
        message: msg.message,
        type: msg.type,
        metadata: msg.metadata ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });

  async function postRoll(
    roll: Omit<RollMessage, "character_name">,
    characterName: string,
  ) {
    await sendMessage({
      type: "roll",
      message: `rolled ${roll.label} = ${roll.total}`,
      senderName: characterName,
      metadata: {
        label: roll.label,
        total: roll.total,
        breakdown: [{ val: roll.dice, dropped: false }],
        modifier: roll.modifier,
        isCrit: roll.dice === 20,
        isFumble: roll.dice === 1,
        // Extra fields for PlayerCharacterView display
        dice: roll.dice,
        character_name: characterName,
      },
    });
  }

  async function postChat(text: string, characterName: string) {
    await sendMessage({
      type: "chat",
      message: text,
      senderName: characterName,
      metadata: null,
    });
  }

  // Helper to extract roll info from existing message format
  function getRollInfo(
    msg: StoredMessage,
  ): {
    dice: number;
    modifier: number;
    total: number;
    label: string;
    character_name: string;
  } | null {
    if (msg.type !== "roll" || !msg.metadata) return null;
    const m = msg.metadata as unknown as Record<string, unknown>;
    return {
      label: (m["label"] as string) ?? "",
      dice:
        (m["dice"] as number | undefined) ??
        (Array.isArray(m["breakdown"]) && (m["breakdown"] as unknown[]).length > 0
          ? ((m["breakdown"] as { val: number }[])[0]).val
          : 0),
      modifier: (m["modifier"] as number) ?? 0,
      total: (m["total"] as number) ?? 0,
      character_name:
        (m["character_name"] as string | undefined) ?? msg.sender_name ?? "Unknown",
    };
  }

  return { messages, isLoading, postRoll, postChat, getRollInfo };
}
