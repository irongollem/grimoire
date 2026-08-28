import { ref, computed } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useParty } from "@/composables/party/useParty";
import { useAllSpecies } from "@/composables/rules/useSpecies";
import { generateChroniclerImage } from "@/ai/useChroniclerImageGeneration";
import { captureImageGenerationContext } from "@/ai/useImageGeneration";
import { buildAiProvenance } from "@/ai/provenance";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";
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
  const { ensureLikenessAck } = useLikenessGate();
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
    if (!(await ensureLikenessAck())) return;
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

      // Captured before the generation await resolves, mirroring every other
      // AI-image caller (e.g. useNpcGeneration) — it's the provider/model this
      // call is actually resolved to use, not a re-read after the fact.
      const imageContext = captureImageGenerationContext();

      const url = await generateChroniclerImage({
        sceneText: "A group portrait of the adventuring party together",
        entities,
        size:      "1536x1024",
        kind:      "group_portrait",
      });

      const updated = await updateCampaign({
        id:     campaignId,
        update: {
          group_portrait_url:            url,
          group_portrait_ai_provenance:  buildAiProvenance("group_portrait", imageContext.imageProvider ?? "openai", imageContext.imageModel),
        },
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
        // A manual upload replaces the portrait outright — clearing the AI
        // provenance record here is honest (the image is no longer that AI
        // generation), not an unlabelling of history.
        update: { group_portrait_url: url, group_portrait_ai_provenance: null },
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
