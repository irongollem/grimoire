import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type {
  ScriptoriumDocument,
  ScriptoriumDocumentSummary,
  ScriptoriumDocInsert,
  ScriptoriumDocUpdate,
} from "@/types/scriptorium.types";

const QUERY_KEY = "scriptorium";

/** Columns the list view renders — see ScriptoriumDocumentSummary. Selecting
 *  `*` here shipped every document's full Tiptap body just to draw its card. */
const SUMMARY_COLUMNS =
  "id, title, doc_type, tags, is_published, word_count, created_at, updated_at";

async function fetchDocuments(): Promise<ScriptoriumDocumentSummary[]> {
  const { data, error } = await supabase
    .from("scriptorium_documents")
    .select(SUMMARY_COLUMNS)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as ScriptoriumDocumentSummary[];
}

async function fetchDocument(id: string): Promise<ScriptoriumDocument> {
  const { data, error } = await supabase
    .from("scriptorium_documents")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as ScriptoriumDocument;
}

async function createDocument(doc: ScriptoriumDocInsert): Promise<ScriptoriumDocument> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("scriptorium_documents")
    .insert({ ...doc, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as ScriptoriumDocument;
}

async function updateDocument(
  id: string,
  update: ScriptoriumDocUpdate,
): Promise<ScriptoriumDocument> {
  const { data, error } = await supabase
    .from("scriptorium_documents")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ScriptoriumDocument;
}

async function deleteDocument(id: string): Promise<void> {
  const { error } = await supabase.from("scriptorium_documents").delete().eq("id", id);
  if (error) throw error;
}

export function useScriptoriumDocuments() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchDocuments });
}

export function useScriptoriumDocument(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchDocument(id.value),
    enabled: () => !!id.value,
  });
}

export function useCreateScriptoriumDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateScriptoriumDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: ScriptoriumDocUpdate }) =>
      updateDocument(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteScriptoriumDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
