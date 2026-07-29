import { ref, computed } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { useParty } from "@/composables/useParty";
import { useAllSpecies } from "@/composables/useSpecies";
import { generateChroniclerImage } from "@/ai/useChroniclerImageGeneration";
import { uploadToBucket } from "@/lib/storage";
import { getCurrentUser } from "@/lib/supabase";
import { toWebP } from "@/lib/mediaConvert";
import type { SpeciesSize } from "@/types/species.types";

const SIZE_HEIGHT_DEFAULTS: Record<SpeciesSize, string> = {
  tiny:   "about 2 ft tall",
  small:  "about 3–4 ft tall",
  medium: "about 5–6 ft tall",
  large:  "about 9–10 ft tall",
};

export function useGroupPortrait() {
  const store = useCampaignStore();
  const { data: partyMembers } = useParty();
  const { data: allSpecies }   = useAllSpecies();
  const { mutateAsync: updateCampaign } = useUpdateCampaign();

  const generating = ref(false);
  const error      = ref("");

  const groupPortraitUrl = computed(() => store.activeCampaign?.group_portrait_url ?? null);

  function resolveHeight(speciesId: string | null, override: string | null | undefined): string | null {
    if (override) return override;
    const species = allSpecies.value?.find((s) => s.id === speciesId);
    if (!species) return null;
    return species.avg_height ?? (species.size ? SIZE_HEIGHT_DEFAULTS[species.size] : null);
  }

  async function generateGroupPortrait() {
    if (!store.activeCampaignId || !store.activeCampaign) return;
    const campaignId = store.activeCampaignId;
    generating.value = true;
    error.value      = "";
    try {
      const members = partyMembers.value ?? [];
      const entities = members.map((m) => {
        const height = resolveHeight(m.species_id, m.height);
        return {
          label:           m.name,
          portraitUrl:     m.portrait_url ?? null,
          textDescription: height ? `${m.name} (${height})` : m.name,
        };
      });

      const url = await generateChroniclerImage({
        sceneText: "A group portrait of the adventuring party together",
        entities,
        size:      "1536x1024",
        kind:      "group_portrait",
      });

      const updated = await updateCampaign({
        id:     campaignId,
        update: { group_portrait_url: url },
      });
      store.switchToCampaign(updated);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : "Generation failed.";
    } finally {
      generating.value = false;
    }
  }

  async function uploadGroupPortrait(file: File) {
    if (!store.activeCampaignId || !store.activeCampaign) return;
    generating.value = true;
    error.value      = "";
    try {
      const user = getCurrentUser();
      const converted = await toWebP(file);
      const url = await uploadToBucket({
        bucket:      "chronicle",
        blob:        converted,
        path:        `${user!.id}/group-portrait-${Date.now()}.${converted.type === "image/webp" ? "webp" : "jpeg"}`,
        contentType: converted.type,
      });
      if (!url) throw new Error("Upload failed.");
      const updated = await updateCampaign({
        id:     store.activeCampaignId,
        update: { group_portrait_url: url },
      });
      store.switchToCampaign(updated);
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : "Upload failed.";
    } finally {
      generating.value = false;
    }
  }

  return { groupPortraitUrl, partyMembers, generating, error, generateGroupPortrait, uploadGroupPortrait };
}
