import { computed, ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { uploadToBucket, deleteFromBucket, removeByPublicUrl } from "@/lib/storage";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { toOpus } from "@/lib/mediaConvert";
import { useImageUpload } from "@/composables/useImageUpload";
import { persistReorder } from "@/lib/reorder";
import type { Sound, SoundInsert, SoundUpdate } from "@/types/sound.types";

const QUERY_KEY = "sounds";

// ── Supabase helpers ──────────────────────────────────────────────────────

async function fetchSounds(campaignId: string): Promise<Sound[]> {
  const { data, error } = await supabase
    .from("sounds")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Sound[];
}

async function createSound(sound: SoundInsert & { user_id: string }): Promise<Sound> {
  const { data, error } = await supabase
    .from("sounds")
    .insert(sound)
    .select()
    .single();
  if (error) throw error;
  return data as Sound;
}

async function updateSound(id: string, update: SoundUpdate): Promise<Sound> {
  const { data, error } = await supabase
    .from("sounds")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Sound;
}

async function deleteSound(sound: Sound, currentUserId: string): Promise<void> {
  const { error } = await supabase.from("sounds").delete().eq("id", sound.id);
  if (error) throw error;
  // Only the file's owner removes the underlying objects. If a shared-campaign
  // viewer ever gains a way to "remove" a sound from their view, that should
  // drop their reference, not the uploads that everyone else still points at.
  if (sound.user_id === currentUserId) {
    // `library_id` is checked as well as `storage_path` even though catalogue
    // rows are written with a null path. This delete is destructive and shared:
    // the catalogue file backs every campaign that added it, so one stray path
    // on one row would take the sound away from everyone. Two conditions is a
    // cheap price for that not being possible.
    if (sound.storage_path && sound.library_id === null) {
      await deleteFromBucket("sounds", [sound.storage_path]);
    }
    if (sound.thumbnail_url) {
      await removeByPublicUrl("soundImages", sound.thumbnail_url);
    }
  }
}

// ── Query hooks ───────────────────────────────────────────────────────────

export function useSounds(enabled?: () => boolean) {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value]),
    queryFn: () => fetchSounds(activeCampaignId.value!),
    enabled: () => !!activeCampaignId.value && (enabled?.() ?? true),
  });
}

export function useCreateSound() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const auth = useAuthStore();

  return useMutation({
    mutationFn: (sound: Omit<SoundInsert, "campaign_id"> & { campaign_id?: string }) =>
      createSound({
        ...sound,
        campaign_id: sound.campaign_id ?? activeCampaignId.value!,
        user_id: auth.user!.id,
      }),
    onSuccess: (_sound, input) => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, input.campaign_id ?? activeCampaignId.value] });
    },
  });
}

export function useUpdateSound() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: SoundUpdate }) =>
      updateSound(id, update),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

export function useDeleteSound() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const auth = useAuthStore();

  return useMutation({
    mutationFn: (sound: Sound) => deleteSound(sound, auth.user!.id),
    // Optimistic: the card leaves the grid on the click, not after the round
    // trip — a delete that visibly does nothing for a beat reads as a failure.
    onMutate: async (sound) => {
      const key = [QUERY_KEY, activeCampaignId.value];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Sound[]>(key);
      if (previous !== undefined) {
        qc.setQueryData<Sound[]>(key, previous.filter((s) => s.id !== sound.id));
      }
      return { key, previous };
    },
    onError: (_err, _sound, context) => {
      if (context !== undefined && context.previous !== undefined) {
        qc.setQueryData(context.key, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

export function useMoveSound() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: ({ id, pageId }: { id: string; pageId: string | null }) =>
      updateSound(id, { page_id: pageId }),
    // Optimistic: Sortable snaps the dropped card back to its old slot, so if
    // the cache only changes after the write the drop looks rejected first.
    onMutate: async ({ id, pageId }) => {
      const key = [QUERY_KEY, activeCampaignId.value];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Sound[]>(key);
      if (previous !== undefined) {
        qc.setQueryData<Sound[]>(
          key,
          previous.map((s) => (s.id === id ? { ...s, page_id: pageId } : s)),
        );
      }
      return { key, previous };
    },
    onError: (_err, _vars, context) => {
      if (context !== undefined && context.previous !== undefined) {
        qc.setQueryData(context.key, context.previous);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

export function useBulkAssignToPage() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: async ({ pageId, campaignId }: { pageId: string; campaignId: string }) => {
      const { error } = await supabase
        .from("sounds")
        .update({ page_id: pageId })
        .eq("campaign_id", campaignId)
        .is("page_id", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

export function useReorderSounds() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: async (updates: Array<{ id: string; sort_order: number }>) => {
      await persistReorder("reorder_sounds", updates);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
    },
  });
}

// ── Storage upload ────────────────────────────────────────────────────────

export function useSoundUpload() {
  const auth = useAuthStore();
  const isConverting = ref(false);
  const isUploading = ref(false);
  const isBusy = computed(() => isConverting.value || isUploading.value);
  const statusText = computed(() => {
    if (isConverting.value) return "Converting WAV…";
    if (isUploading.value) return "Uploading…";
    return "";
  });

  async function upload(
    file: File,
  ): Promise<{ file_url: string; storage_path: string } | null> {
    if (!auth.user) return null;

    isConverting.value = true;
    let processed: File;
    try {
      processed = await toOpus(file);
    } finally {
      isConverting.value = false;
    }

    isUploading.value = true;
    try {
      const ext = processed.name.split(".").pop() ?? "mp3";
      const storagePath = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
      const fileUrl = await uploadToBucket({ bucket: "sounds", blob: processed, path: storagePath, contentType: processed.type });
      if (!fileUrl) return null;
      return { file_url: fileUrl, storage_path: storagePath };
    } catch {
      return null;
    } finally {
      isUploading.value = false;
    }
  }

  async function remove(storagePath: string): Promise<void> {
    await deleteFromBucket("sounds", [storagePath]);
  }

  return { isBusy, statusText, isConverting, isUploading, upload, remove };
}

// ── Thumbnail upload ──────────────────────────────────────────────────────
//
// Uploads a cover-art image for a sound to the sound-images bucket.
// Images are converted to WebP by useImageUpload before upload.
// The public URL is stored in sounds.thumbnail_url; no storage path is
// persisted because removeByPublicUrl() can derive it from the URL.

export function useSoundThumbnailUpload() {
  const { isUploading, uploadError, upload, remove } = useImageUpload("sound-images");
  return { isUploading, uploadError, upload, remove };
}
