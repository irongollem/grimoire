import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { PuzzleRoom, PuzzleInsert, PuzzleUpdate } from "@/types/puzzle.types";
import { removeStorageImages } from "@/composables/useImageUpload";
import { PUZZLE_TEMPLATES } from "@/data/puzzleTemplates";
import type { Ref } from "vue";
import { computed, isRef, onUnmounted, ref, watch } from "vue";
import { useCampaignStore } from "@/stores/campaign";

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

export function usePuzzles() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchPuzzles });
}

export function usePuzzle(id: string | Ref<string>) {
  const resolved = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, resolved.value]),
    queryFn: () => fetchPuzzle(resolved.value),
    enabled: () => !!resolved.value,
  });
}

/**
 * Subscribe to realtime updates for a single puzzle room.
 * When the DM reveals/hides hints or toggles sharing, the player's
 * cached query is invalidated and immediately re-fetched.
 * Call this in the player detail view alongside usePuzzle().
 */
export function usePuzzleRealtime(id: string | Ref<string>) {
  const qc       = useQueryClient();
  const resolved = isRef(id) ? id : ref(id);
  let channel: ReturnType<typeof supabase.channel> | null = null;

  function subscribe(puzzleId: string) {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
    if (!puzzleId) return;
    channel = supabase
      .channel(`puzzle_rooms:${puzzleId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "puzzle_rooms", filter: `id=eq.${puzzleId}` },
        () => {
          qc.invalidateQueries({ queryKey: [QUERY_KEY, puzzleId] });
          qc.invalidateQueries({ queryKey: [QUERY_KEY] });
        },
      )
      .subscribe();
  }

  watch(resolved, (v) => subscribe(v), { immediate: true });

  onUnmounted(() => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
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

/** Player-visible puzzles shared into the active campaign. */
export function usePlayerVisiblePuzzles() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "player", campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("puzzle_rooms")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .eq("is_shared", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as PuzzleRoom[];
    },
    enabled: () => !!campaignId.value,
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

      const toInsert = PUZZLE_TEMPLATES
        .filter((p) => !existingNames.has(p.name.toLowerCase()))
        .map((p) => ({ ...p, user_id: user.id, image_focal_point: null, campaign_id: null, is_shared: false, shared_hints: [], read_aloud: null }));

      if (!toInsert.length) return 0;

      const { error } = await supabase.from("puzzle_rooms").insert(toInsert);
      if (error) throw error;

      return toInsert.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
