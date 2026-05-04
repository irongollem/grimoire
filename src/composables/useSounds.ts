import { computed, ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
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

async function deleteSound(sound: Sound): Promise<void> {
  const { error } = await supabase.from("sounds").delete().eq("id", sound.id);
  if (error) throw error;
  if (sound.storage_path) {
    await deleteFromBucket("sounds", [sound.storage_path]);
  }
}

// ── Query hooks ───────────────────────────────────────────────────────────

export function useSounds() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, activeCampaignId.value]),
    queryFn: () => fetchSounds(activeCampaignId.value!),
    enabled: () => !!activeCampaignId.value,
  });
}

export function useCreateSound() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const auth = useAuthStore();

  return useMutation({
    mutationFn: (sound: Omit<SoundInsert, "campaign_id">) =>
      createSound({
        ...sound,
        campaign_id: activeCampaignId.value!,
        user_id: auth.user!.id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, activeCampaignId.value] });
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

  return useMutation({
    mutationFn: (sound: Sound) => deleteSound(sound),
    onSuccess: () => {
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
    onSuccess: () => {
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
    mutationFn: async (orderedIds: string[]) => {
      // Upsert sort_order for each id in the new order
      const updates = orderedIds.map((id, index) =>
        supabase.from("sounds").update({ sort_order: index }).eq("id", id),
      );
      await Promise.all(updates);
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
