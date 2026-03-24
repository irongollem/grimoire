import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

/**
 * Reusable image upload composable.
 *
 * Usage:
 *   const { isUploading, upload } = useImageUpload('asset-images')
 *   const url = await upload(file)   // returns public URL or null on error
 *
 * The file is stored at: {bucket}/{user_id}/{uuid}.{ext}
 */
export function useImageUpload(bucket: string) {
  const auth = useAuthStore();
  const isUploading = ref(false);

  async function upload(file: File): Promise<string | null> {
    if (!auth.user) return null;
    isUploading.value = true;
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${auth.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file);
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
