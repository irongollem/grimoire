import { toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { ScriptoriumNote } from "@/types/scriptorium.types";

/** The caller's own notes: read scoped to the user AND the book in the query, not left to RLS. */
function me(): string {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

const notesKey = (docId: string) => ["scriptorium", docId, "notes"] as const;

async function fetchNotes(docId: string): Promise<ScriptoriumNote[]> {
  const { data, error } = await supabase
    .from("scriptorium_notes")
    .select("*")
    .eq("user_id", me())
    .eq("document_id", docId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as ScriptoriumNote[];
}

export function useBookNotes(docId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: () => notesKey(toValue(docId)),
    queryFn: () => fetchNotes(toValue(docId)),
    enabled: () => !!toValue(docId),
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      documentId: string;
      chapterId: string;
      blockId: string | null;
      body: string;
    }): Promise<ScriptoriumNote> => {
      const { data, error } = await supabase
        .from("scriptorium_notes")
        .insert({
          user_id: me(),
          document_id: input.documentId,
          chapter_id: input.chapterId,
          block_id: input.blockId,
          body: input.body,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ScriptoriumNote;
    },
    onSuccess: (_note, { documentId }) =>
      queryClient.invalidateQueries({ queryKey: notesKey(documentId) }),
  });
}

export function useUpdateNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      body,
      done,
    }: {
      id: string;
      body?: string;
      done?: boolean;
    }): Promise<ScriptoriumNote> => {
      const { data, error } = await supabase
        .from("scriptorium_notes")
        .update({ ...(body !== undefined ? { body } : {}), ...(done !== undefined ? { done } : {}) })
        .eq("id", id)
        .eq("user_id", me())
        .select()
        .single();
      if (error) throw error;
      return data as ScriptoriumNote;
    },
    onSuccess: (note) => queryClient.invalidateQueries({ queryKey: notesKey(note.document_id) }),
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; documentId: string }): Promise<void> => {
      const { error } = await supabase.from("scriptorium_notes").delete().eq("id", id).eq("user_id", me());
      if (error) throw error;
    },
    onSuccess: (_void, { documentId }) =>
      queryClient.invalidateQueries({ queryKey: notesKey(documentId) }),
  });
}
