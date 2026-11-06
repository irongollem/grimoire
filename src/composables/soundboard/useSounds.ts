import { computed, ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { readDeckSlice } from "@/lib/audio/deck/deckBatch";
import { uploadToBucket, deleteFromBucket } from "@/lib/storage";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { toOpus } from "@/lib/mediaConvert";
import type { Sound, SoundInsert, SoundUpdate } from "@/types/sound.types";

const QUERY_KEY = "sounds";

// ── Supabase helpers ──────────────────────────────────────────────────────

async function fetchSounds(campaignId: string): Promise<Sound[]> {
  const { data, error } = await supabase
    .from("sounds")
    .select("*")
    .eq("campaign_id", campaignId)
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

// ── Query hooks ───────────────────────────────────────────────────────────

/** The campaign's sound query, shared by `useSounds` and by readers that must
 *  fetch it on demand without mounting an observer (`useAudioThemeTriggers`, #999). */
export function soundsQueryOptions(campaignId: string) {
  return {
    queryKey: [QUERY_KEY, campaignId] as const,
    queryFn: () => fetchSounds(campaignId),
  };
}

/** `enabled` lets always-mounted surfaces (the floating player, the palette) wait until they are shown (#999). */
export function useSounds(enabled?: () => boolean) {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value] as const),
    queryFn: ({ queryKey: [, campaignId] }) => {
      if (campaignId === null) throw new Error("useSounds fetched without a campaign");
      return readDeckSlice(campaignId, "sounds", () => fetchSounds(campaignId));
    },
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
