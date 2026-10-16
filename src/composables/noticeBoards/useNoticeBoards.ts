import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { useCampaignStore } from "@/stores/campaign";
import { NOTICE_BOARDS_KEY } from "@/lib/campaignLiveSync/registry";
import type {
  NoticeBoard,
  NoticeBoardInsert,
  NoticeBoardPin,
  NoticeBoardPinInsert,
  NoticeBoardPinUpdate,
  NoticeBoardUpdate,
} from "@/types/noticeBoard.types";

// Boards are campaign-bound (never library-scoped), so every read names the
// campaign itself: RLS is DM-only and a ceiling, not a filter (CLAUDE.md, Client Reads).

export async function fetchNoticeBoards(campaignId: string): Promise<NoticeBoard[]> {
  const { data, error } = await supabase
    .from("notice_boards")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as NoticeBoard[];
}

export async function fetchNoticeBoard(id: string): Promise<NoticeBoard> {
  const { data, error } = await supabase.from("notice_boards").select("*").eq("id", id).single();
  if (error) throw error;
  return data as NoticeBoard;
}

export async function fetchNoticeBoardPins(boardId: string): Promise<NoticeBoardPin[]> {
  const { data, error } = await supabase
    .from("notice_board_pins")
    .select("*")
    .eq("board_id", boardId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as NoticeBoardPin[];
}

export async function fetchCampaignNoticeBoardPins(campaignId: string): Promise<NoticeBoardPin[]> {
  const { data, error } = await supabase
    .from("notice_board_pins")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as NoticeBoardPin[];
}

export async function createNoticeBoard(board: NoticeBoardInsert): Promise<NoticeBoard> {
  const user = getCurrentUser();
  if (!user) throw new Error("notice board created without a signed-in user");
  const { data, error } = await supabase
    .from("notice_boards")
    .insert({ ...board, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as NoticeBoard;
}

export async function updateNoticeBoard(id: string, update: NoticeBoardUpdate): Promise<NoticeBoard> {
  const { data, error } = await supabase.from("notice_boards").update(update).eq("id", id).select().single();
  if (error) throw error;
  return data as NoticeBoard;
}

/**
 * The pins go with the board (cascade), and so would their pictures stay behind in storage, so the urls are read
 * first. A portrait copied from an NPC is still the NPC's: the sweep keeps any file another row holds.
 */
export async function deleteNoticeBoard(id: string): Promise<void> {
  const pins = await fetchNoticeBoardPins(id);
  const { error } = await supabase.from("notice_boards").delete().eq("id", id);
  if (error) throw error;
  await deleteUnreferencedByPublicUrl({ urls: pins.map((p) => p.image_url) });
}

export async function createNoticeBoardPin(pin: NoticeBoardPinInsert): Promise<NoticeBoardPin> {
  const user = getCurrentUser();
  if (!user) throw new Error("notice pin created without a signed-in user");
  const { data, error } = await supabase
    .from("notice_board_pins")
    .insert({ ...pin, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as NoticeBoardPin;
}

export async function updateNoticeBoardPin(id: string, update: NoticeBoardPinUpdate): Promise<NoticeBoardPin> {
  const { data, error } = await supabase.from("notice_board_pins").update(update).eq("id", id).select().single();
  if (error) throw error;
  return data as NoticeBoardPin;
}

/** Returns the deleted row's picture so its file can be swept once the row no longer counts as a reference to it. */
export async function deleteNoticeBoardPin(id: string): Promise<void> {
  const { data, error } = await supabase.from("notice_board_pins").delete().eq("id", id).select("image_url");
  if (error) throw error;
  await deleteUnreferencedByPublicUrl({ urls: (data ?? []).map((row: { image_url: string | null }) => row.image_url) });
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function useNoticeBoards() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [NOTICE_BOARDS_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (!cid) throw new Error("useNoticeBoards fetched without a campaign; enabled guarantees one");
      return fetchNoticeBoards(cid);
    },
    enabled: () => !!campaignId.value,
    staleTime: 30_000,
  });
}

export function useNoticeBoard(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [NOTICE_BOARDS_KEY, "one", id.value] as const),
    queryFn: ({ queryKey: [, , boardId] }) => fetchNoticeBoard(boardId),
    enabled: () => !!id.value,
  });
}

export function useNoticeBoardPins(boardId: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [NOTICE_BOARDS_KEY, "pins", boardId.value] as const),
    queryFn: ({ queryKey: [, , bid] }) => fetchNoticeBoardPins(bid),
    enabled: () => !!boardId.value,
  });
}

/** Every pin of the active campaign, so the list's cards can draw a mini board without a request each. */
export function useCampaignNoticeBoardPins() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [NOTICE_BOARDS_KEY, "campaign-pins", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (!cid) throw new Error("useCampaignNoticeBoardPins fetched without a campaign; enabled guarantees one");
      return fetchCampaignNoticeBoardPins(cid);
    },
    enabled: () => !!campaignId.value,
    staleTime: 30_000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

function invalidateAll(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: [NOTICE_BOARDS_KEY] });
}

export function useCreateNoticeBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createNoticeBoard,
    onSettled: () => invalidateAll(queryClient),
  });
}

export function useUpdateNoticeBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: NoticeBoardUpdate }) => updateNoticeBoard(id, update),
    onSettled: () => invalidateAll(queryClient),
  });
}

export function useDeleteNoticeBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteNoticeBoard,
    onSettled: () => invalidateAll(queryClient),
  });
}

/** Revealing shares the board; hiding it must also take it off the table, because presented_at requires is_revealed (a check constraint). */
export function useSetNoticeBoardRevealed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, revealed }: { boardId: string; revealed: boolean }) =>
      updateNoticeBoard(boardId, revealed ? { is_revealed: true } : { is_revealed: false, presented_at: null }),
    onSettled: () => invalidateAll(queryClient),
  });
}

/** Presenting opens the board for taking; the database takes down any other presented board in the campaign. */
export function usePresentNoticeBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ boardId, present }: { boardId: string; present: boolean }) =>
      updateNoticeBoard(boardId, { presented_at: present ? new Date().toISOString() : null }),
    onSettled: () => invalidateAll(queryClient),
  });
}

export function useCreateNoticeBoardPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createNoticeBoardPin,
    onSettled: () => invalidateAll(queryClient),
  });
}

/**
 * Optimistic: a pin being dragged writes on every drop, and without the cache
 * patch it would snap back to its old spot until the refetch lands. Both pin
 * lists (one board's, the campaign's) are patched, take the saved row on
 * success, and are restored and refetched on error. A success refetches
 * nothing: the write rings the campaign doorbell, which refreshes every
 * notice-board query in every tab, this one included, so invalidating here too
 * would fetch everything twice per drop and per autosave.
 */
export function useUpdateNoticeBoardPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: NoticeBoardPinUpdate }) => updateNoticeBoardPin(id, update),
    onMutate: async ({ id, update }) => {
      await queryClient.cancelQueries({ queryKey: [NOTICE_BOARDS_KEY] });
      const snapshots = pinLists(queryClient);
      for (const [key, pins] of snapshots) {
        queryClient.setQueryData<NoticeBoardPin[]>(
          key,
          pins.map((p) => (p.id === id ? { ...p, ...update } : p)),
        );
      }
      return { snapshots };
    },
    onSuccess: (saved) => {
      for (const [key, pins] of pinLists(queryClient)) {
        queryClient.setQueryData<NoticeBoardPin[]>(
          key,
          pins.map((p) => (p.id === saved.id ? saved : p)),
        );
      }
    },
    onError: (_error, _vars, context) => {
      for (const [key, pins] of context?.snapshots ?? []) queryClient.setQueryData(key, pins);
      void invalidateAll(queryClient);
    },
  });
}

/** The two cached pin lists (one board's, the campaign's); boards and single boards are left alone. */
function pinLists(queryClient: QueryClient): [readonly unknown[], NoticeBoardPin[]][] {
  return queryClient
    .getQueriesData<NoticeBoardPin[]>({ queryKey: [NOTICE_BOARDS_KEY] })
    .filter((entry): entry is [readonly unknown[], NoticeBoardPin[]] => {
      const [key, pins] = entry;
      return Array.isArray(pins) && (key[1] === "pins" || key[1] === "campaign-pins");
    });
}

export function useDeleteNoticeBoardPin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteNoticeBoardPin,
    onSettled: () => invalidateAll(queryClient),
  });
}

/** Undoes a take: the taken_* fields clear together because status 'taken' requires taken_at (a check constraint). */
export function usePinNoticeBackUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pinId: string) =>
      updateNoticeBoardPin(pinId, { status: "up", taken_by: null, taken_at: null, taken_session_number: null }),
    onSettled: () => invalidateAll(queryClient),
  });
}
