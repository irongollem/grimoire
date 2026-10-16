import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { PLAYER_HANDOUTS_KEY, PLAYER_NOTICE_BOARDS_KEY } from "@/lib/campaignLiveSync/registry";
import { QUESTS_KEY } from "@/composables/quests/useQuests";
import type { PlayerNoticeBoard, TakeNoticeResult } from "@/types/noticeBoard.types";

/**
 * Routes through get_player_notice_boards: the base tables are DM-only, and the
 * projection withholds what a notice offers until it is taken.
 */
export async function fetchPlayerNoticeBoards(campaignId: string): Promise<PlayerNoticeBoard[]> {
  const { data, error } = await supabase.rpc("get_player_notice_boards", { p_campaign_id: campaignId });
  if (error) throw error;
  return data as PlayerNoticeBoard[];
}

/** "already_taken" is a normal answer (the handout opens all the same), so only a real failure throws. */
export async function takeNoticeBoardPin(pinId: string): Promise<TakeNoticeResult> {
  const { data, error } = await supabase.rpc("take_notice_board_pin", { p_pin_id: pinId });
  if (error) throw error;
  return data as TakeNoticeResult;
}

/** The revealed boards of the active campaign, for the signed-in player. */
export function usePlayerNoticeBoards() {
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const partyMemberId = computed(() => auth.linkedPartyMemberId);
  return useQuery({
    queryKey: computed(() => [PLAYER_NOTICE_BOARDS_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (!cid) throw new Error("usePlayerNoticeBoards fetched without a campaign; enabled guarantees one");
      return fetchPlayerNoticeBoards(cid);
    },
    // The same gate as the player's handouts: a seated character reads, a DM does not.
    enabled: () => !!campaignId.value && !!partyMemberId.value,
  });
}

/** One board, picked from the list: no request of its own. Absent while loading or if withdrawn. */
export function usePlayerNoticeBoard(id: Ref<string>) {
  const { data } = usePlayerNoticeBoards();
  return computed(() => data.value?.find((b) => b.id === id.value) ?? null);
}

/** The board the DM is presenting (the database allows at most one), or null. */
export function usePresentedNoticeBoard() {
  const { data } = usePlayerNoticeBoards();
  return computed(() => data.value?.find((b) => b.presented_at !== null) ?? null);
}

/** Tears a notice down. A take can grant a quest and a handout, so those lists refresh with the boards. */
export function useTakeNoticePin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: takeNoticeBoardPin,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [PLAYER_NOTICE_BOARDS_KEY] }),
        queryClient.invalidateQueries({ queryKey: [QUESTS_KEY] }),
        queryClient.invalidateQueries({ queryKey: [PLAYER_HANDOUTS_KEY] }),
      ]),
  });
}
