import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type {
  ScriptoriumDocument,
  ScriptoriumDocumentSummary,
  ScriptoriumDocInsert,
  HandoutShareResult,
  ScriptoriumDocUpdate,
} from "@/types/scriptorium.types";

const QUERY_KEY = "scriptorium";

/** Columns the list view renders — see ScriptoriumDocumentSummary. Selecting
 *  `*` here shipped every document's full Tiptap body just to draw its card. */
const SUMMARY_COLUMNS =
  "id, title, doc_type, campaign_id, tags, is_published, player_visible_to, word_count, created_at, updated_at";

/** The caller's own id, for scoping reads to their own documents. Since #970 a
 *  player may also SELECT a handout shared with them, so RLS alone would mix
 *  another table's handouts into a DM's own Scriptorium (CLAUDE.md, Client
 *  Reads: RLS is a ceiling, not a filter). */
function ownerId(): string {
  const user = getCurrentUser();
  if (!user) throw new Error("Not signed in");
  return user.id;
}

async function fetchDocuments(): Promise<ScriptoriumDocumentSummary[]> {
  const { data, error } = await supabase
    .from("scriptorium_documents")
    .select(SUMMARY_COLUMNS)
    .eq("user_id", ownerId())
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data as ScriptoriumDocumentSummary[];
}

async function fetchDocument(id: string): Promise<ScriptoriumDocument> {
  const { data, error } = await supabase
    .from("scriptorium_documents")
    .select("*")
    .eq("id", id)
    .eq("user_id", ownerId())
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
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, docId] }) => fetchDocument(docId),
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

/** The `share_handout` RPC. `dryRun` writes nothing and is the confirmation summary. */
async function callShareHandout(
  id: string,
  partyMemberIds: string[],
  dryRun: boolean,
): Promise<HandoutShareResult> {
  const { data, error } = await supabase.rpc("share_handout", {
    p_document_id: id,
    p_party_member_ids: partyMemberIds,
    p_dry_run: dryRun,
  });
  if (error) throw error;
  return data as unknown as HandoutShareResult;
}

/** What sharing the document with exactly these party members would do. */
export function previewHandoutShare(
  id: string,
  partyMemberIds: string[],
): Promise<HandoutShareResult> {
  return callShareHandout(id, partyMemberIds, true);
}

/** Sets the full recipient set and applies every linked entry's reveal (#970). */
export function useShareHandout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, partyMemberIds }: { id: string; partyMemberIds: string[] }) =>
      callShareHandout(id, partyMemberIds, false),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}
