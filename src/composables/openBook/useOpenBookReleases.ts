import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { OPEN_BOOK_KEY, OPEN_BOOK_RELEASES_KEY } from "@/lib/campaignLiveSync/registry";
import { deleteByPublicUrl } from "@/lib/storage/remove";
import { reportHandledError } from "@/lib/observability/sentry";
import type { OpenBookPreview, OpenBookRelease, OpenBookSnapshot } from "@/types/openBook.types";

/** Every column but `snapshot`, which is the bulk of a row and is read only when one release is opened. */
export const RELEASE_LIST_COLUMNS = "id, campaign_id, created_by, number, note, stats, pdf_url, created_at, updated_at";

export function openBookReleasesKey(campaignId: string | null) {
  return [OPEN_BOOK_RELEASES_KEY, campaignId] as const;
}

export function releaseSnapshotKey(releaseId: string | null) {
  return [OPEN_BOOK_RELEASES_KEY, "snapshot", releaseId] as const;
}

export function openBookPreviewKey(campaignId: string | null) {
  return [OPEN_BOOK_KEY, "preview", campaignId] as const;
}

/** Releases of the campaign's book, newest first, without their snapshots. */
export function useOpenBookReleases(campaignId: MaybeRefOrGetter<string | null | undefined>) {
  const id = computed(() => toValue(campaignId) ?? null);
  return useQuery({
    queryKey: computed(() => openBookReleasesKey(id.value)),
    queryFn: async (): Promise<OpenBookRelease[]> => {
      if (id.value === null) throw new Error("useOpenBookReleases fetched without a campaign");
      const { data, error } = await supabase
        .from("open_book_releases")
        .select(RELEASE_LIST_COLUMNS)
        .eq("campaign_id", id.value)
        .order("number", { ascending: false });
      if (error) throw error;
      return data as unknown as OpenBookRelease[];
    },
    enabled: computed(() => id.value !== null),
  });
}

/** Freezes the book as it stands now into a new release and makes it the live one. */
export function useReleaseOpenBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, note }: { campaignId: string; note?: string | null }) => {
      const { data, error } = await supabase.rpc("release_open_book", {
        p_campaign_id: campaignId,
        p_note: note ?? null,
      });
      if (error) throw error;
      return data as OpenBookRelease;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_RELEASES_KEY] }),
        queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_KEY] }),
      ]);
    },
  });
}

/**
 * Removes a PDF object once nothing points at it. Best effort: the row it belonged to is already changed or gone,
 * so a failure here leaves an unreferenced file, which is worth a report and not worth failing the action for.
 */
async function removePdfObject(url: string | null): Promise<void> {
  if (!url) return;
  try {
    await deleteByPublicUrl(url);
  } catch (err) {
    reportHandledError(err, "openBook:removePdf", { url });
  }
}

/** Deletes a release. The live one is refused silently by RLS, so the row is read back to say so. */
export function useDeleteRelease() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaignId, releaseId }: { campaignId: string; releaseId: string }) => {
      const { data, error } = await supabase
        .from("open_book_releases")
        .delete()
        .eq("campaign_id", campaignId)
        .eq("id", releaseId)
        .select("id, pdf_url");
      if (error) throw error;
      if (data.length === 0) throw new Error("The live release cannot be deleted; put another back first.");
      // The release's PDF goes with it, once the row is certainly gone.
      await removePdfObject(data[0].pdf_url);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_RELEASES_KEY] }),
  });
}

export function useUpdateReleaseNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      campaignId,
      releaseId,
      note,
    }: {
      campaignId: string;
      releaseId: string;
      note: string | null;
    }) => {
      const { error } = await supabase
        .from("open_book_releases")
        .update({ note })
        .eq("campaign_id", campaignId)
        .eq("id", releaseId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_RELEASES_KEY] }),
  });
}

/**
 * Records the PDF exported for a release (`pdf_url` is one of the two columns the owner may update). The file it
 * replaces is removed after the row points at the new one, so a reader never follows a link to a deleted file.
 */
export function useSetReleasePdf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      campaignId,
      releaseId,
      pdfUrl,
      previousUrl,
    }: {
      campaignId: string;
      releaseId: string;
      pdfUrl: string;
      previousUrl: string | null;
    }) => {
      const { data, error } = await supabase
        .from("open_book_releases")
        .update({ pdf_url: pdfUrl })
        .eq("campaign_id", campaignId)
        .eq("id", releaseId)
        .select("id");
      if (error) throw error;
      if (data.length === 0) throw new Error("That release is no longer in the book.");
      if (previousUrl && previousUrl !== pdfUrl) await removePdfObject(previousUrl);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [OPEN_BOOK_RELEASES_KEY] }),
  });
}

/** What a release made now would hold. Not live: it is read when the panel opens and again on request. */
export function useOpenBookPreview(
  campaignId: MaybeRefOrGetter<string | null | undefined>,
  enabled: MaybeRefOrGetter<boolean>,
) {
  const id = computed(() => toValue(campaignId) ?? null);
  return useQuery({
    queryKey: computed(() => openBookPreviewKey(id.value)),
    queryFn: async (): Promise<OpenBookPreview | null> => {
      if (id.value === null) throw new Error("useOpenBookPreview fetched without a campaign");
      const { data, error } = await supabase.rpc("preview_open_book", { p_campaign_id: id.value });
      if (error) throw error;
      return data as OpenBookPreview | null;
    },
    enabled: computed(() => id.value !== null && toValue(enabled)),
    staleTime: 0,
    gcTime: 0,
  });
}

/** One release's frozen book, read from its row. */
export async function fetchReleaseSnapshot(campaignId: string, releaseId: string): Promise<OpenBookSnapshot> {
  const { data, error } = await supabase
    .from("open_book_releases")
    .select("snapshot")
    .eq("campaign_id", campaignId)
    .eq("id", releaseId)
    .single();
  if (error) throw error;
  return (data as unknown as { snapshot: OpenBookSnapshot }).snapshot;
}

/** One release's frozen book, for the diff against the next. Immutable, so it is never refetched on its own. */
export function useReleaseSnapshot(
  releaseId: MaybeRefOrGetter<string | null | undefined>,
  enabled: MaybeRefOrGetter<boolean>,
  campaignId: MaybeRefOrGetter<string | null | undefined>,
) {
  const id = computed(() => toValue(releaseId) ?? null);
  const cid = computed(() => toValue(campaignId) ?? null);
  return useQuery({
    queryKey: computed(() => releaseSnapshotKey(id.value)),
    queryFn: async (): Promise<OpenBookSnapshot> => {
      if (id.value === null || cid.value === null) throw new Error("useReleaseSnapshot fetched without a release");
      return fetchReleaseSnapshot(cid.value, id.value);
    },
    enabled: computed(() => id.value !== null && cid.value !== null && toValue(enabled)),
    staleTime: Infinity,
  });
}
