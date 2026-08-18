import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { PuzzleRoom, PuzzleInsert, PuzzleUpdate } from "@/types/puzzle.types";
import { removeStorageImages } from "@/composables/useImageUpload";
import { PUZZLE_TEMPLATES } from "@/data/puzzleTemplates";
import type { Ref } from "vue";
import { computed, isRef, ref } from "vue";
import { storeToRefs } from "pinia";
import { useCampaignStore } from "@/stores/campaign";
import { allowedCampaignScoped } from "@/lib/campaignContentGating";

const QUERY_KEY = "puzzle_rooms";

async function fetchPuzzles(): Promise<PuzzleRoom[]> {
  const { data, error } = await supabase
    .from("puzzle_rooms")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as PuzzleRoom[];
}

async function fetchPuzzle(id: string): Promise<PuzzleRoom | null> {
  const { data, error } = await supabase
    .from("puzzle_rooms")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as PuzzleRoom | null;
}

async function createPuzzle(puzzle: PuzzleInsert): Promise<PuzzleRoom> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("puzzle_rooms")
    .insert({ ...puzzle, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as PuzzleRoom;
}

async function updatePuzzle(id: string, update: PuzzleUpdate): Promise<PuzzleRoom> {
  const { data, error } = await supabase
    .from("puzzle_rooms")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as PuzzleRoom;
}

async function deletePuzzle(puzzle: PuzzleRoom): Promise<void> {
  const { error } = await supabase.from("puzzle_rooms").delete().eq("id", puzzle.id);
  if (error) throw error;
  await removeStorageImages("asset-images", puzzle.image_url);
}

export interface UsePuzzlesOptions {
  /** When true, return every puzzle regardless of campaign scope. Default
   *  false: scoped to general + active campaign, for browsing (#597). */
  includeAllScopes?: boolean;
}

/** The DM's puzzles, scoped to general + the active campaign.
 *
 *  `campaign_id` carries one meaning here, not two: the campaign this puzzle
 *  belongs to. Sharing sets it (a puzzle cannot be shown to players without a
 *  campaign to show it in) and the Scope control sets it directly — so a
 *  shared puzzle is a scoped puzzle, and stops appearing in the DM's other
 *  campaigns. `is_shared` remains the separate question of whether the players
 *  in that campaign can see it. */
export function usePuzzles(getOptions?: () => UsePuzzlesOptions) {
  const query = useQuery({ queryKey: [QUERY_KEY], queryFn: fetchPuzzles });
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const data = computed(() => {
    const puzzles = query.data.value;
    if (!puzzles || getOptions?.().includeAllScopes) return puzzles;
    return allowedCampaignScoped(puzzles, activeCampaignId.value);
  });
  return { ...query, data };
}

export function usePuzzle(id: string | Ref<string>) {
  const resolved = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, resolved.value]),
    queryFn: () => fetchPuzzle(resolved.value),
    enabled: () => !!resolved.value,
  });
}

export function useCreatePuzzle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createPuzzle,
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdatePuzzle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: PuzzleUpdate }) => updatePuzzle(id, update),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeletePuzzle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePuzzle,
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: [QUERY_KEY, id] });
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Player-visible puzzles shared into the active campaign. Routes through the
 * get_player_visible_puzzles SECURITY DEFINER projection (migration
 * 20260711000009) — NOT a base-table `select *` — so DM-only columns
 * (solution, success/failure outcomes, notes) and unrevealed hints never reach
 * the client. Players have no direct base-table read path (RLS is owner-only).
 */
export function usePlayerVisiblePuzzles() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "player", campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_player_visible_puzzles", {
        p_campaign_id: campaignId.value!,
        p_puzzle_id: null,
      });
      if (error) throw error;
      return ((data ?? []) as PuzzleRoom[]).sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: () => !!campaignId.value,
  });
}

/**
 * A single player-visible puzzle by id, via the same projection. Used by the
 * player detail view instead of usePuzzle (which does a base-table `select *`
 * and would leak DM secrets to any player who opened devtools). The central
 * campaign realtime registry invalidates this projection after a puzzle event;
 * raw puzzle rows must never be written into this cache.
 */
export function usePlayerVisiblePuzzle(id: string | Ref<string>) {
  const resolved = isRef(id) ? id : ref(id);
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "player-one", campaignId.value, resolved.value]),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_player_visible_puzzles", {
        p_campaign_id: campaignId.value,
        p_puzzle_id: resolved.value,
      });
      if (error) throw error;
      return ((data ?? []) as PuzzleRoom[])[0] ?? null;
    },
    enabled: () => !!campaignId.value && !!resolved.value,
  });
}

/** Bulk-insert template puzzles that don't already exist (matched by name). Returns inserted count. */
export function usePopulatePuzzles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      const { data: existing, error: fetchError } = await supabase
        .from("puzzle_rooms")
        .select("id, name");
      if (fetchError) throw fetchError;

      const existingNames = new Set(
        (existing ?? []).map((p: { id: string; name: string }) => p.name.toLowerCase()),
      );

      // campaign_id stays null: these are generic templates, and the
      // not-already-present check below spans the DM's whole collection —
      // scope them and a second campaign's "Populate" would find the names
      // taken and seed nothing.
      const toInsert = PUZZLE_TEMPLATES
        .filter((p) => !existingNames.has(p.name.toLowerCase()))
        .map((p) => ({ ...p, user_id: user.id, image_focal_point: null, campaign_id: null, is_shared: false, shared_hints: [], player_visible_to: [], read_aloud: null, location_id: null, dungeon_feature_id: null }));

      if (!toInsert.length) return 0;

      const { error } = await supabase.from("puzzle_rooms").insert(toInsert);
      if (error) throw error;

      return toInsert.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
