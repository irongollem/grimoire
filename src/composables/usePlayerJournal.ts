import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

// ── Types ──────────────────────────────────────────────────────────────────────

export type JournalCategory = "adventure" | "clue" | "discovery" | "session" | "character" | "rumor";

export const JOURNAL_CATEGORIES: Record<JournalCategory, { label: string; color: string }> = {
  adventure: { label: "Adventure Log", color: "#ca8a04" },
  clue:      { label: "Clue",          color: "#d97706" },
  discovery: { label: "Discovery",     color: "#7c3aed" },
  session:   { label: "Session Log",   color: "#0284c7" },
  character: { label: "Character",     color: "#e11d48" },
  rumor:     { label: "Rumor",         color: "#0d9488" },
};

export const JOURNAL_CATEGORY_LIST = Object.entries(JOURNAL_CATEGORIES) as [
  JournalCategory,
  { label: string; color: string },
][];

export type JournalRefType = "quest" | "npc" | "location" | "item" | "monster" | "encounter";

export interface PlayerJournalEntry {
  id: string;
  user_id: string;
  campaign_id: string;
  title: string | null;
  content: string;
  category: JournalCategory;
  tags: string[];
  is_private: boolean;
  ref_type: JournalRefType | null;
  ref_id: string | null;
  ref_label: string | null;
  created_at: string;
  updated_at: string;
}

export type PlayerJournalEntryInsert = Omit<PlayerJournalEntry, "id" | "user_id" | "created_at" | "updated_at">;
export type PlayerJournalEntryUpdate = Partial<Omit<PlayerJournalEntryInsert, "campaign_id">>;

// ── Query key ─────────────────────────────────────────────────────────────────

const KEY = "player_journal";

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchMyEntries(campaignId: string): Promise<PlayerJournalEntry[]> {
  const { data, error } = await supabase
    .from("player_journal_entries")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PlayerJournalEntry[];
}

async function fetchSharedEntries(campaignId: string): Promise<PlayerJournalEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("player_journal_entries")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("is_private", false)
    .neq("user_id", user!.id) // exclude own — they appear in "My Journal"
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as PlayerJournalEntry[];
}

async function createEntry(entry: PlayerJournalEntryInsert): Promise<PlayerJournalEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("player_journal_entries")
    .insert({ ...entry, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as PlayerJournalEntry;
}

async function updateEntry(id: string, update: PlayerJournalEntryUpdate): Promise<PlayerJournalEntry> {
  const { data, error } = await supabase
    .from("player_journal_entries")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as PlayerJournalEntry;
}

async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from("player_journal_entries").delete().eq("id", id);
  if (error) throw error;
}

// ── Composables ───────────────────────────────────────────────────────────────

/** All entries authored by the current user in the active campaign. */
export function useMyJournalEntries() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [KEY, "mine", campaignId.value]),
    queryFn: () => fetchMyEntries(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

/** All shared (non-private) entries from other players in the active campaign. */
export function useSharedJournalEntries() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [KEY, "shared", campaignId.value]),
    queryFn: () => fetchSharedEntries(campaignId.value!),
    enabled: () => !!campaignId.value,
  });
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (entry: Omit<PlayerJournalEntryInsert, "campaign_id">) =>
      createEntry({ ...entry, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: PlayerJournalEntryUpdate }) =>
      updateEntry(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteEntry,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
