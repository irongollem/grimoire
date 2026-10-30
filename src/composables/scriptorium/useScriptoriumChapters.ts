import { toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/vue-query";
import type { JSONContent } from "@tiptap/core";
import { supabase } from "@/lib/supabase";
import { chapterTitle, countWords } from "@/lib/scriptorium/chapterTitle";
import type { ScriptoriumChapter, ScriptoriumChapterSummary } from "@/types/scriptorium.types";

/**
 * Chapters of a Scriptorium book (#1115). Every read names its book in the
 * query (RLS is a ceiling, not a filter) and throws its error.
 *
 * Keys:
 *  - `["scriptorium", docId, "chapters"]`          summaries, no bodies
 *  - `["scriptorium", docId, "chapters", "full"]`  every body, for preview and export
 *  - `["scriptorium-chapter", chapterId]`          one chapter with its body
 * The chapter body sits under its own root so an invalidation of the book never
 * refetches the chapter someone is typing into.
 */
const ROOT = "scriptorium";
const CHAPTER_ROOT = "scriptorium-chapter";

const SUMMARY_COLUMNS = "id, document_id, position, title, word_count, created_at, updated_at";

const listKey = (docId: string) => [ROOT, docId, "chapters"] as const;
const fullKey = (docId: string) => [ROOT, docId, "chapters", "full"] as const;
const chapterKey = (chapterId: string) => [CHAPTER_ROOT, chapterId] as const;

async function fetchChapterList(docId: string): Promise<ScriptoriumChapterSummary[]> {
  const { data, error } = await supabase
    .from("scriptorium_chapters")
    .select(SUMMARY_COLUMNS)
    .eq("document_id", docId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as ScriptoriumChapterSummary[];
}

async function fetchChaptersFull(docId: string): Promise<ScriptoriumChapter[]> {
  const { data, error } = await supabase
    .from("scriptorium_chapters")
    .select("*")
    .eq("document_id", docId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as ScriptoriumChapter[];
}

async function fetchChapter(chapterId: string): Promise<ScriptoriumChapter> {
  const { data, error } = await supabase
    .from("scriptorium_chapters")
    .select("*")
    .eq("id", chapterId)
    .single();
  if (error) throw error;
  return data as ScriptoriumChapter;
}

export function useBookChapterList(docId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: () => listKey(toValue(docId)),
    queryFn: () => fetchChapterList(toValue(docId)),
    enabled: () => !!toValue(docId),
  });
}

export function useBookChaptersFull(
  docId: MaybeRefOrGetter<string>,
  options: { enabled?: MaybeRefOrGetter<boolean> } = {},
) {
  return useQuery({
    queryKey: () => fullKey(toValue(docId)),
    queryFn: () => fetchChaptersFull(toValue(docId)),
    enabled: () => !!toValue(docId) && (options.enabled === undefined || toValue(options.enabled)),
  });
}

export function useScriptoriumChapter(chapterId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: () => chapterKey(toValue(chapterId)),
    queryFn: () => fetchChapter(toValue(chapterId)),
    enabled: () => !!toValue(chapterId),
  });
}

/** The book's own row changes with its chapters (word count, updated_at, the list order). */
function refreshBook(queryClient: QueryClient, docId: string): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [ROOT, docId], exact: true }),
    queryClient.invalidateQueries({ queryKey: [ROOT], exact: true }),
  ]);
}

export function useCreateChapter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      documentId,
      content,
    }: {
      documentId: string;
      content?: JSONContent;
    }): Promise<ScriptoriumChapter> => {
      const body: JSONContent = content ?? { type: "doc", content: [{ type: "paragraph" }] };
      const { data: last, error: lastError } = await supabase
        .from("scriptorium_chapters")
        .select("position")
        .eq("document_id", documentId)
        .order("position", { ascending: false })
        .limit(1);
      if (lastError) throw lastError;
      const positions = last as { position: number }[];
      const position = positions.length ? positions[0].position + 1 : 0;
      const { data, error } = await supabase
        .from("scriptorium_chapters")
        .insert({
          document_id: documentId,
          position,
          title: chapterTitle(body),
          content: body,
          word_count: countWords(body),
        })
        .select()
        .single();
      if (error) throw error;
      return data as ScriptoriumChapter;
    },
    onSuccess: (_chapter, { documentId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey(documentId) }),
        refreshBook(queryClient, documentId),
      ]),
  });
}

/**
 * The autosave target. The server's answer goes back into the chapter's own
 * cache rather than invalidating it: a refetch under the typist would replace
 * what they typed since the save left.
 */
export function useSaveChapter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      content,
    }: {
      id: string;
      documentId: string;
      content: JSONContent;
    }): Promise<ScriptoriumChapter> => {
      const { data, error } = await supabase
        .from("scriptorium_chapters")
        .update({ content, title: chapterTitle(content), word_count: countWords(content) })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ScriptoriumChapter;
    },
    onSuccess: (saved, { id, documentId }) => {
      queryClient.setQueryData(chapterKey(id), saved);
      queryClient.setQueryData<ScriptoriumChapterSummary[]>(listKey(documentId), (list) =>
        list?.map((row) =>
          row.id === id
            ? { ...row, title: saved.title, word_count: saved.word_count, updated_at: saved.updated_at }
            : row,
        ),
      );
      // The whole book's bodies are patched in place too: invalidating them would download
      // every chapter again on every autosave (1.86 MB for a 533-page book).
      queryClient.setQueryData<ScriptoriumChapter[]>(fullKey(documentId), (chapters) =>
        chapters?.map((chapter) => (chapter.id === id ? saved : chapter)),
      );
      return refreshBook(queryClient, documentId);
    },
  });
}

export function useDeleteChapter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, documentId }: { id: string; documentId: string }): Promise<void> => {
      // A book keeps at least one chapter. The database refuses the delete that would empty
      // it (private.keep_one_chapter, 20261030072503) with "A book needs at least one
      // chapter.", which is what the rail shows. A read-then-delete here could not hold that:
      // two tabs deleting different chapters of a two-chapter book both read "two".
      const { error } = await supabase
        .from("scriptorium_chapters")
        .delete()
        .eq("id", id)
        .eq("document_id", documentId);
      if (error) throw error;
    },
    onSuccess: (_void, { id, documentId }) => {
      queryClient.removeQueries({ queryKey: chapterKey(id) });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey(documentId) }),
        refreshBook(queryClient, documentId),
      ]);
    },
  });
}

export function useReorderChapters() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      documentId,
      orderedIds,
    }: {
      documentId: string;
      orderedIds: string[];
    }): Promise<void> => {
      // One statement for the whole order (reorder_scriptorium_chapters): one touch of the book
      // and one ring to the players holding it, however many chapters moved, and never half an
      // order. An order that no longer names every chapter (one was added or deleted elsewhere)
      // is refused, and the settle-time refetch brings the real list back.
      const { error } = await supabase.rpc("reorder_scriptorium_chapters", {
        p_document_id: documentId,
        p_chapter_ids: orderedIds,
      });
      if (error) throw error;
    },
    onMutate: async ({ documentId, orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: listKey(documentId) });
      const previous = queryClient.getQueryData<ScriptoriumChapterSummary[]>(listKey(documentId));
      if (previous) {
        queryClient.setQueryData<ScriptoriumChapterSummary[]>(
          listKey(documentId),
          orderedIds.flatMap((id, position) => {
            const row = previous.find((candidate) => candidate.id === id);
            return row ? [{ ...row, position }] : [];
          }),
        );
      }
      return { previous };
    },
    onError: (_error, { documentId }, context) => {
      if (context?.previous) queryClient.setQueryData(listKey(documentId), context.previous);
    },
    onSettled: (_data, _error, { documentId }) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey(documentId) }),
        queryClient.invalidateQueries({ queryKey: fullKey(documentId) }),
      ]),
  });
}
