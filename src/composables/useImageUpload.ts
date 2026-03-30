import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";

/** Convert any image File to WebP (max 1920px longest edge, 85% quality).
 *  Falls back to the original file if canvas conversion fails. */
async function toWebP(file: File, maxPx = 1920, quality = 0.85): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), { type: "image/webp" }));
          } else {
            resolve(file);
          }
        },
        "image/webp",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

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
