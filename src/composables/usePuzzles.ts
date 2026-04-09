import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { PuzzleRoom, PuzzleInsert, PuzzleUpdate } from "@/types/puzzle.types";
import { PUZZLE_TEMPLATES } from "@/data/puzzleTemplates";
import type { Ref } from "vue";
import { computed, isRef, ref } from "vue";

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

async function deletePuzzle(id: string): Promise<void> {
  const { error } = await supabase.from("puzzle_rooms").delete().eq("id", id);
  if (error) throw error;
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
        .map((p) => ({ ...p, user_id: user.id, image_focal_point: null }));

      if (!toInsert.length) return 0;

      const { error } = await supabase.from("puzzle_rooms").insert(toInsert);
      if (error) throw error;

      return toInsert.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
