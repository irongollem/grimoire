import { computed } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { galleryQueryKey, type ImageGenKind } from "@/composables/ai/useImageGenerationLog";

export interface GalleryImage {
  id: string;
  kind: ImageGenKind;
  image_url: string;
  prompt: string;
  size: string;
  model: string | null;
  provider: string | null;
  target_table: string | null;
  target_id: string | null;
  target_column: string | null;
  created_at: string;
}

/**
 * All of the current user's finished AI image generations for the active
 * campaign, newest first. RLS scopes rows to the user; the `chronicler` kind is
 * included since chronicle images live in the same table.
 */
export function useGalleryImages() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  const query = useQuery({
    queryKey: computed(() => galleryQueryKey(activeCampaignId.value)),
    enabled: computed(() => !!activeCampaignId.value),
    queryFn: async (): Promise<GalleryImage[]> => {
      const { data, error } = await supabase
        .from("image_generation_jobs")
        .select("id, kind, image_url, prompt, size, model, provider, target_table, target_id, target_column, created_at")
        .eq("campaign_id", activeCampaignId.value!)
        .eq("status", "ready")
        .not("image_url", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GalleryImage[];
    },
  });

  const images = computed(() => query.data.value ?? []);

  /** Count of images per kind, for tab badges. */
  const countsByKind = computed<Record<string, number>>(() => {
    const acc: Record<string, number> = {};
    for (const img of images.value) acc[img.kind] = (acc[img.kind] ?? 0) + 1;
    return acc;
  });

  return { query, images, countsByKind };
}

/** Delete a generated image row (removes it from the Gallery). */
export function useDeleteGalleryImage() {
  const qc = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from("image_generation_jobs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: galleryQueryKey(activeCampaignId.value) });
    },
  });
}
