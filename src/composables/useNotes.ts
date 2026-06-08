import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { Note, NoteInsert, NoteUpdate } from "@/types/notes.types";
import { storeToRefs } from "pinia";

const QUERY_KEY = "notes";

async function fetchNotes(campaignId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as Note[];
}

async function fetchNote(id: string): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Note;
}

async function createNote(note: NoteInsert): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .insert(note)
    .select()
    .single();
  if (error) throw error;
  return data as Note;
}

async function updateNote(id: string, update: NoteUpdate): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Note;
}

async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

export function useNotes() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value]),
    queryFn: () => fetchNotes(activeCampaignId.value!),
    enabled: () => !!activeCampaignId.value,
  });
}

export function useNote(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchNote(id.value),
    enabled: () => !!id.value,
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (note: Omit<NoteInsert, "campaign_id">) =>
      createNote({ ...note, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: NoteUpdate }) =>
      updateNote(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

async function reorderNotes(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from("notes").update({ sort_order: index }).eq("id", id),
    ),
  );
}

export function useReorderNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderNotes,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
