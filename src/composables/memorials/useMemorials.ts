import { computed } from "vue";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import type { CharacterMemorial, MemorialKind, MemorialMourner } from "@/types/memorial.types";

const KEY = "memorials";

async function fetchCampaignMemorials(campaignId: string): Promise<CharacterMemorial[]> {
  const { data, error } = await supabase
    .from("character_memorials")
    .select("*")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return data as CharacterMemorial[];
}

async function fetchWall(): Promise<{ memorials: CharacterMemorial[]; mourners: MemorialMourner[] }> {
  const { data, error } = await supabase
    .from("character_memorials")
    .select("*")
    .is("restored_at", null);
  if (error) throw error;
  const memorials = data as CharacterMemorial[];
  if (memorials.length === 0) return { memorials, mourners: [] };
  const { data: rows, error: mournersError } = await supabase
    .from("memorial_mourners")
    .select("*")
    .in("memorial_id", memorials.map((m) => m.id));
  if (mournersError) throw mournersError;
  return { memorials, mourners: rows as MemorialMourner[] };
}

async function fetchMyMourners(userId: string): Promise<MemorialMourner[]> {
  const { data, error } = await supabase
    .from("memorial_mourners")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return data as MemorialMourner[];
}

/** Why a character on the wall cannot be deleted (the database refuses it silently). */
export const FALLEN_DELETE_REASON = "In the Hall of the Fallen. Restore them first to delete.";

/** True while a memorial is in effect for this character (restored_at is null). */
export function hasMemorialInEffect(memorials: readonly CharacterMemorial[] | undefined, partyMemberId: string): boolean {
  return !!memorials?.some((m) => m.party_member_id === partyMemberId && m.restored_at === null);
}

/** Every memorial row of a campaign, restored ones included (the party list needs both). */
export function useCampaignMemorials(campaignId?: () => string | null, enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const cid = computed(() => (campaignId ? campaignId() : campaign.activeCampaignId));
  return useQuery({
    queryKey: computed(() => [KEY, "campaign", cid.value] as const),
    queryFn: ({ queryKey: [, , id] }) => {
      if (!id) throw new Error("useCampaignMemorials fetched without a campaign — enabled guarantees it's set");
      return fetchCampaignMemorials(id);
    },
    enabled: () => !!cid.value && (enabled ? enabled() : true),
  });
}

/** The wall: every memorial I may see, across campaigns, with the mourner rows of each. */
export function useWallMemorials() {
  return useQuery({ queryKey: [KEY, "wall"] as const, queryFn: fetchWall });
}

/** My own mourner rows (candles, notices seen, keep / let-go answers). */
export function useMyMournerRows() {
  const auth = useAuthStore();
  const uid = computed(() => auth.user?.id ?? null);
  return useQuery({
    queryKey: computed(() => [KEY, "mine", uid.value] as const),
    queryFn: ({ queryKey: [, , id] }) => {
      if (!id) throw new Error("useMyMournerRows fetched without a user — enabled guarantees it's set");
      return fetchMyMourners(id);
    },
    enabled: () => !!uid.value,
  });
}

function invalidateMemorials(qc: QueryClient, alsoParty: boolean): Promise<unknown> {
  const keys = [[KEY], ...(alsoParty ? [["party"], ["my-characters"]] : [])];
  return Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

export interface SetCharacterDownInput {
  partyMemberId: string;
  kind: MemorialKind;
  /** A null field is not written. */
  gameDate: string | null;
  realDate: string | null;
  account: string | null;
  lastBlow: string | null;
  lastWords: string | null;
}

export function useSetCharacterDown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: SetCharacterDownInput) => {
      const { error } = await supabase.rpc("set_character_down", {
        p_party_member_id: i.partyMemberId,
        p_kind: i.kind,
        p_game_date: i.gameDate,
        p_real_date: i.realDate,
        p_account: i.account,
        p_last_blow: i.lastBlow,
        p_last_words: i.lastWords,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMemorials(qc, true),
  });
}

export function useRestoreCharacter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (partyMemberId: string) => {
      const { error } = await supabase.rpc("restore_character", { p_party_member_id: partyMemberId });
      if (error) throw error;
    },
    onSuccess: () => invalidateMemorials(qc, true),
  });
}

export interface EditMemorialAccountInput {
  partyMemberId: string;
  gameDate: string | null;
  realDate: string | null;
  account: string | null;
  lastBlow: string | null;
}

export function useEditMemorialAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: EditMemorialAccountInput) => {
      const { error } = await supabase.rpc("edit_memorial_account", {
        p_party_member_id: i.partyMemberId,
        p_game_date: i.gameDate,
        p_real_date: i.realDate,
        p_account: i.account,
        p_last_blow: i.lastBlow,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMemorials(qc, false),
  });
}

export function useWriteLastWords() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (i: { partyMemberId: string; lastWords: string | null }) => {
      const { error } = await supabase.rpc("write_last_words", {
        p_party_member_id: i.partyMemberId,
        p_last_words: i.lastWords,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateMemorials(qc, false),
  });
}

type MournerGesture = "candle_lit_at" | "tolled_at" | "kept_at" | "let_go_at";

/** Upserts my own mourner row, stamping one gesture column with now. */
async function stampMourner(
  userId: string | undefined,
  memorialId: string,
  campaignId: string,
  column: MournerGesture,
): Promise<void> {
  if (!userId) throw new Error("Sign in to light a candle or answer for a memorial.");
  const { error } = await supabase
    .from("memorial_mourners")
    .upsert(
      { memorial_id: memorialId, user_id: userId, campaign_id: campaignId, [column]: new Date().toISOString() },
      { onConflict: "memorial_id,user_id" },
    );
  if (error) throw error;
}

export interface MournerTarget {
  memorialId: string;
  campaignId: string;
}

/** One mutation serves every card: the memorial is named when it is called, not when it is created. */
function useMournerMutation(column: MournerGesture) {
  const qc = useQueryClient();
  const auth = useAuthStore();
  return useMutation({
    mutationFn: (t: MournerTarget) => stampMourner(auth.user?.id, t.memorialId, t.campaignId, column),
    onSuccess: () => invalidateMemorials(qc, false),
  });
}

export function useLightCandle() {
  return useMournerMutation("candle_lit_at");
}
export function useMarkTolled() {
  return useMournerMutation("tolled_at");
}
export function useKeepMemorial() {
  return useMournerMutation("kept_at");
}
export function useLetGoMemorial() {
  return useMournerMutation("let_go_at");
}
