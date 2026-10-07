import { reportHandledError } from "@/lib/observability/sentry";
import { computed, type Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { PLAYER_NOTES_KEY } from "@/lib/campaignLiveSync/registry";
import type { Note, NoteInsert, NoteUpdate } from "@/types/notes.types";
import { storeToRefs } from "pinia";
import { useToast } from "@/composables/useToast";
import { persistReorder, toReorderEntries } from "@/lib/reorder";

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

/** What the Pinned Notes widget renders: a title, a category and a text preview. */
export type PinnedNote = Pick<Note, "id" | "title" | "category" | "content">;

const PINNED_NOTE_COLUMNS = "id, title, category, content";

async function fetchPinnedNotes(campaignId: string, limit: number): Promise<PinnedNote[]> {
  const { data, error } = await supabase
    .from("notes")
    .select(PINNED_NOTE_COLUMNS)
    .eq("campaign_id", campaignId)
    .eq("is_pinned", true)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as PinnedNote[];
}

/** The id of a session that has a note, which is all the "no notes yet" gaps need. */
export type SessionNoteLink = Pick<Note, "id" | "session_id">;

async function fetchSessionNoteLinks(campaignId: string): Promise<SessionNoteLink[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, session_id")
    .eq("campaign_id", campaignId)
    .not("session_id", "is", null);
  if (error) throw error;
  return data as SessionNoteLink[];
}

/** The newest note of one session, content only; null when the session has none. */
async function fetchSessionRecap(campaignId: string, sessionId: string): Promise<Pick<Note, "content"> | null> {
  const { data, error } = await supabase
    .from("notes")
    .select("content")
    .eq("campaign_id", campaignId)
    .eq("session_id", sessionId)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return (data as Pick<Note, "content">[])[0] ?? null;
}

/**
 * The notes a player may read, as the server projects them: secret blocks are
 * stripped there (`get_player_visible_notes`, #932), so the DM-only passages
 * never reach this client. Players can no longer select `notes` at all; every
 * player surface reads this instead of `useNotes`.
 *
 * With a DM previewing as a party member the RPC returns exactly what that
 * member would see, so the screen needs no client-side filtering of its own.
 * Refreshed by the `notes_player` doorbell (see SIGNAL_KEYS).
 */
export function usePlayerVisibleNotes() {
  const campaign = useCampaignStore();
  const ui = useUiStore();
  const previewMemberId = computed(() => (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : null));
  return useQuery({
    queryKey: computed(() => [PLAYER_NOTES_KEY, campaign.activeCampaignId, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, cid, previewId] }): Promise<Note[]> => {
      if (!cid) throw new Error("usePlayerVisibleNotes fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_visible_notes", {
        p_campaign_id: cid,
        p_preview_member_id: previewId,
      });
      if (error) throw error;
      return (data as Note[]).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    },
    enabled: () => !!campaign.activeCampaignId,
  });
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

/**
 * Exported so a resolved downtime outcome can mint a seed note into the campaign.
 *
 * Stamps the signed-in user, as `createItem` does. `notes.user_id` is NOT NULL
 * with no default, and `NoteInsert` has no `user_id`, so a caller could not pass
 * one honestly: the note editor smuggled it in through an untyped spread, and
 * the downtime seed reward (which had no such spread) failed every insert.
 */
export async function createNote(note: NoteInsert): Promise<Note> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("notes")
    .insert({ ...note, user_id: user.id })
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

/** The list read the notes page performs; shared with the navigation prefetch. */
export function noteListQuery(campaignId: string | null) {
  return {
    queryKey: [QUERY_KEY, campaignId] as const,
    queryFn: () => {
      if (!campaignId) throw new Error("useNotes fetched without a campaign");
      return fetchNotes(campaignId);
    },
  };
}

/** `enabled` defers the fetch for a surface that is mounted before it is used
 *  (the Scriptorium draft dialog lives in the always-mounted generator cluster). */
export function useNotes(enabled: () => boolean = () => true) {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  const options = computed(() => noteListQuery(activeCampaignId.value));
  return useQuery({
    queryKey: computed(() => options.value.queryKey),
    queryFn: () => options.value.queryFn(),
    enabled: () => !!activeCampaignId.value && enabled(),
  });
}

/**
 * The newest pinned notes, for the dashboard. The three narrow readers below
 * sit under `["notes", campaignId, ...]`, three or more segments, so the
 * realtime reducer for exact note rows (two segments) leaves them alone and
 * `invalidateNarrowNoteCaches` refetches them on any note change instead.
 */
export function usePinnedNotes(limit: number) {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value, "pinned", limit] as const),
    queryFn: ({ queryKey: [, campaignId] }) => {
      if (!campaignId) throw new Error("usePinnedNotes fetched without a campaign");
      return fetchPinnedNotes(campaignId, limit);
    },
    enabled: () => !!activeCampaignId.value,
  });
}

/** Which sessions have a note, without loading any note's prose. */
export function useSessionNoteLinks() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value, "session-links"] as const),
    queryFn: ({ queryKey: [, campaignId] }) => {
      if (!campaignId) throw new Error("useSessionNoteLinks fetched without a campaign");
      return fetchSessionNoteLinks(campaignId);
    },
    enabled: () => !!activeCampaignId.value,
  });
}

/** One session's recap note (content only), fetched on demand rather than with every note. */
export function useSessionRecap(sessionId: Ref<string | undefined>) {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value, "session-recap", sessionId.value] as const),
    queryFn: ({ queryKey: [, campaignId, , id] }) => {
      if (!campaignId || !id) throw new Error("useSessionRecap fetched without a campaign or session");
      return fetchSessionRecap(campaignId, id);
    },
    enabled: () => !!activeCampaignId.value && !!sessionId.value,
  });
}

export function useNote(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, noteId] }) => fetchNote(noteId),
    enabled: () => !!id.value,
  });
}

/**
 * Queue this note for semantic-search embedding (#600) so retrieval can find it
 * without waiting for the next admin backfill.
 *
 * Fire-and-forget on purpose: the note is already saved, so a failed embed
 * is not worth a toast, a spinner or a delayed mutation — the row simply stays
 * unembedded and the next backfill sweep collects it. The edge function
 * short-circuits when the embed text's hash is unchanged, so a save that
 * touched an unrelated field costs no API call at all.
 */
export function queueNoteEmbedding(id: string): void {
  void supabase.functions
    .invoke("embed-content", { body: { mode: "single", entity: "note", id } })
    .catch((error) => reportHandledError(error, "queueNoteEmbedding", { id }));
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (note: Omit<NoteInsert, "campaign_id">) =>
      createNote({ ...note, campaign_id: campaign.activeCampaignId! }),
    onSuccess: (note) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queueNoteEmbedding(note.id);
    },
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
      queueNoteEmbedding(id);
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: deleteNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

async function reorderNotes(orderedIds: string[]): Promise<void> {
  await persistReorder("reorder_notes", toReorderEntries(orderedIds));
}

export function useReorderNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderNotes,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
