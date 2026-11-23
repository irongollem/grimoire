import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";

/** "Describe from the pictures": the model reads the look's pictures and writes the look. Proposes only; the caller writes. */
export function useDescribeLook() {
  const isDescribing = ref(false);
  const error = ref<string | null>(null);

  async function describe(campaignId: string, images: readonly string[], currentLook: string): Promise<string | null> {
    isDescribing.value = true;
    error.value = null;
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("describe-look", {
        body: {
          campaign_id: campaignId,
          images: [...images],
          ...(currentLook.trim() !== "" ? { current_look: currentLook } : {}),
        },
      });
      if (invokeError) throw new Error(await edgeErrorMessage(invokeError));
      const look = (data as { look?: string } | null)?.look;
      if (!look || look.trim() === "") throw new Error("The pictures gave no description. Try again.");
      return look.trim();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Could not describe the pictures.";
      return null;
    } finally {
      isDescribing.value = false;
    }
  }

  return { describe, isDescribing, error };
}
