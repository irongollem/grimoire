import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { toWebP } from "@/lib/mediaConvert";

/**
 * Reusable image upload composable.
 *
 * Usage:
 *   const { isUploading, upload } = useImageUpload('asset-images')
 *   const url = await upload(file)   // returns public URL or null on error
 *
 * The file is stored at: {bucket}/{user_id}/{uuid}.webp
 * All images are converted to WebP before upload (max 1920px, 85% quality).
 */
export function useImageUpload(bucket: string) {
  const auth = useAuthStore();
  const isUploading = ref(false);

  async function upload(file: File): Promise<string | null> {
    if (!auth.user) return null;
    isUploading.value = true;
    try {
      const webpFile = await toWebP(file);
      const path = `${auth.user.id}/${crypto.randomUUID()}.webp`;
      const { error } = await supabase.storage.from(bucket).upload(path, webpFile, { contentType: "image/webp" });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return data.publicUrl;
    } catch {
      return null;
    } finally {
      isUploading.value = false;
    }
  }

  /** Delete a file from the bucket given its public URL. Silently no-ops on bad URLs. */
  async function remove(publicUrl: string): Promise<void> {
    if (!publicUrl) return;
    // Extract path after /public/{bucket}/
    const marker = `/object/public/${bucket}/`;
    const idx = publicUrl.indexOf(marker);
    if (idx === -1) return;
    const path = publicUrl.slice(idx + marker.length);
    await supabase.storage.from(bucket).remove([decodeURIComponent(path)]);
  }

  return { isUploading, upload, remove };
}
